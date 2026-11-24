import {
  CapabilitySet,
  type DocPageId,
  type DocPageNodeRecord,
  DocRules,
  type DocSpaceId,
  type DocSpaceSummary,
  DocTree,
  type OrganizationId,
  Principal,
  SystemClock,
  type UserId,
  Uuid,
} from "../../../import.js";
import { UnifiedMarkdownRenderer } from "../../../unified/index.js";
import type { DatabaseCluster } from "../../primitive/index.js";
import {
  PgDocPageRepository,
  PgDocSpaceRepository,
  PgOutboxPublisher,
} from "../../repository/index.js";
import { PgUnitOfWork, type ShardScope, type TransactionScope } from "../../transaction/index.js";
import type { DocSeedPage, DocSeedSpace } from "./doc-tree.reader.js";

// A reserved actor for every row the seed writes, so an audit or revision reads as the seed
// rather than as a person. Never a user row: `created_by` columns carry no foreign key.
const SEED_USER_ID = "00000000-0000-7000-8000-000000000002" as UserId;

export interface DocSeedCounts {
  created: number;
  moved: number;
  saved: number;
  published: number;
  removed: number;
}

export interface DocSeedReport {
  readonly spaces: readonly { readonly slug: string; readonly counts: DocSeedCounts }[];
  // A page that did not publish, or a link whose page or heading is not there.
  readonly problems: readonly string[];
}

// Matches the routes `DocTreeReader` writes: `/doc/<space>/<path>` with an optional anchor.
const ROUTE = /\]\((\/doc\/[^)#\s]+)(#[^)\s]+)?\)/g;

// Makes the platform organization's docs spaces match the repository, which owns them, by
// `PublishDocPageUseCase`'s own repository calls. The space cache lapses in its 60 s TTL.
export class DocSpaceSeed {
  private readonly spaces: PgDocSpaceRepository;
  private readonly pages: PgDocPageRepository;
  private readonly tree: DocTree;
  private readonly events: PgOutboxPublisher;
  private readonly unitOfWork: PgUnitOfWork;
  private readonly renderer = new UnifiedMarkdownRenderer();

  public constructor(cluster: DatabaseCluster, scope: TransactionScope, shards: ShardScope) {
    this.spaces = new PgDocSpaceRepository(cluster, scope, shards);
    this.pages = new PgDocPageRepository(cluster, scope, shards);
    this.tree = new DocTree(this.pages, this.spaces);
    this.events = new PgOutboxPublisher(cluster, scope, shards, new SystemClock());
    this.unitOfWork = new PgUnitOfWork(cluster, scope, shards, "routed");
  }

  public async run(
    organizationId: OrganizationId,
    spaces: readonly DocSeedSpace[],
    order: readonly string[],
    repositoryUrl: string | null,
  ): Promise<DocSeedReport> {
    const actor = Principal.system(organizationId, SEED_USER_ID, CapabilitySet.empty());
    const existing = await this.spaces.list(organizationId);
    const report: { slug: string; counts: DocSeedCounts }[] = [];
    for (const space of spaces) {
      // One transaction per space: its pages and its tree commit together or not at all.
      const counts = await this.unitOfWork.run(async () => {
        const spaceId = await this.syncSpace(organizationId, space, existing, order, repositoryUrl);
        return this.syncPages(actor, spaceId, space);
      });
      report.push({ slug: space.slug, counts });
    }
    return { spaces: report, problems: await this.verify(organizationId, spaces) };
  }

  private async syncSpace(
    organizationId: OrganizationId,
    space: DocSeedSpace,
    existing: readonly DocSpaceSummary[],
    order: readonly string[],
    repositoryUrl: string | null,
  ): Promise<DocSpaceId> {
    DocRules.assertSpaceSlug(space.slug);
    const fields = {
      slug: space.slug,
      title: space.title,
      description: space.description,
      icon: space.icon,
      audience: "members" as const,
      theme: null,
      access: null,
      repositoryUrl,
    };
    // The place in the full list, so seeding one space never reorders the rest.
    const position = order.indexOf(space.slug);
    const found = existing.find((row) => row.slug === space.slug);
    if (!found) {
      const id = Uuid.v7() as DocSpaceId;
      await this.spaces.create(organizationId, id, fields, SEED_USER_ID);
      await this.spaces.save(organizationId, id, fields, position);
      return id;
    }
    const drifted =
      found.position !== position ||
      (Object.keys(fields) as (keyof typeof fields)[]).some((key) => found[key] !== fields[key]);
    if (drifted) await this.spaces.save(organizationId, found.id, fields, position);
    return found.id;
  }

  // A node's place in the tree, sections included: the same `key` the reader gave each page.
  private static keyed(nodes: readonly DocPageNodeRecord[]): Map<string, DocPageNodeRecord> {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const keyOf = (node: DocPageNodeRecord) => {
      const segments = [node.slug];
      for (let at = node.parentId && byId.get(node.parentId); at; ) {
        segments.unshift(at.slug);
        at = at.parentId ? byId.get(at.parentId) : undefined;
      }
      return segments.join("/");
    };
    return new Map(nodes.map((node) => [keyOf(node), node]));
  }

  private async syncPages(
    actor: Principal,
    spaceId: DocSpaceId,
    space: DocSeedSpace,
  ): Promise<DocSeedCounts> {
    const organizationId = actor.organizationId;
    const counts: DocSeedCounts = { created: 0, moved: 0, saved: 0, published: 0, removed: 0 };
    await this.tree.lock(organizationId, spaceId);
    const before = await this.pages.listBySpace(organizationId, spaceId);

    // A node the repository no longer has goes, and so does one whose kind changed (a folder
    // that gained or lost its index), which is created again below. Its subtree goes with it.
    const wanted = new Map(space.pages.map((page) => [page.key, page]));
    const gone = new Set<DocPageId>();
    for (const [key, node] of DocSpaceSeed.keyed(before)) {
      if (wanted.get(key)?.kind === node.kind) continue;
      for (const id of DocRules.subtree(before, node.id)) gone.add(id);
    }
    if (gone.size > 0) {
      await this.pages.delete(organizationId, [...gone]);
      await this.events.publish(actor, {
        name: "doc.page.deleted",
        payload: { spaceId, pageIds: [...gone] },
      });
      counts.removed = gone.size;
    }

    const byKey = DocSpaceSeed.keyed(before.filter((node) => !gone.has(node.id)));
    const idOf = new Map<string, DocPageId>([...byKey].map(([key, node]) => [key, node.id]));
    for (const page of space.pages) {
      if (idOf.has(page.key)) continue;
      const id = Uuid.v7() as DocPageId;
      await this.pages.create(organizationId, {
        id,
        spaceId,
        parentId: page.parentKey === null ? null : (idOf.get(page.parentKey) ?? null),
        kind: page.kind,
        slug: page.slug,
        title: page.title,
        icon: null,
        url: null,
        position: page.position,
        createdBy: SEED_USER_ID,
      });
      idOf.set(page.key, id);
      counts.created++;
    }

    counts.moved = await this.syncOrder(organizationId, space.pages, byKey, idOf);
    for (const page of space.pages) {
      const id = idOf.get(page.key);
      if (id) await this.syncBody(actor, spaceId, id, page, counts);
    }
    await this.tree.rebuild(organizationId, spaceId);
    return counts;
  }

  // Each parent's children in the repository's order, written only where it differs.
  private async syncOrder(
    organizationId: OrganizationId,
    pages: readonly DocSeedPage[],
    byKey: ReadonlyMap<string, DocPageNodeRecord>,
    idOf: ReadonlyMap<string, DocPageId>,
  ): Promise<number> {
    const children = new Map<string | null, DocSeedPage[]>();
    for (const page of pages)
      children.set(page.parentKey, [...(children.get(page.parentKey) ?? []), page]);
    let moved = 0;
    for (const [parentKey, list] of children) {
      const settled = list.every((page) => byKey.get(page.key)?.position === page.position);
      if (settled) continue;
      const parentId = parentKey === null ? null : (idOf.get(parentKey) ?? null);
      const ids = list.map((page) => idOf.get(page.key)).filter((id): id is DocPageId => !!id);
      await this.pages.saveOrder(organizationId, parentId, ids);
      // Only pages that existed: a new one is placed by its create, which is not a move.
      moved += list.filter((page) => {
        const node = byKey.get(page.key);
        return node !== undefined && node.position !== page.position;
      }).length;
    }
    return moved;
  }

  private async syncBody(
    actor: Principal,
    spaceId: DocSpaceId,
    pageId: DocPageId,
    page: DocSeedPage,
    counts: DocSeedCounts,
  ): Promise<void> {
    const organizationId = actor.organizationId;
    let draft = await this.pages.findDraft(organizationId, pageId);
    if (!draft) throw new Error(`doc page ${page.key} vanished mid-seed`);
    // A section has no body: its draft keeps whatever Markdown it was created with.
    const markdown = page.kind === "page" ? page.markdown : draft.markdown;
    const changed =
      draft.markdown !== markdown ||
      draft.title !== page.title ||
      draft.description !== page.description;
    if (changed) {
      const fields = {
        slug: page.slug,
        title: page.title,
        description: page.description,
        icon: draft.icon,
        markdown,
        url: null,
        access: draft.access,
      };
      const saved = await this.pages.saveDraft(
        organizationId,
        pageId,
        draft.draftVersion,
        fields,
        SEED_USER_ID,
      );
      if (!saved) throw new Error(`doc page ${page.key} changed under the seed`);
      draft = await this.pages.findDraft(organizationId, pageId);
      if (!draft) throw new Error(`doc page ${page.key} vanished mid-seed`);
      counts.saved++;
    }
    if (page.kind !== "page" || draft.publishedDraftVersion === draft.draftVersion) return;

    const rendered = await this.renderer.render(draft.markdown);
    const publication = {
      title: draft.title,
      description: draft.description,
      markdown: draft.markdown,
      html: rendered.html,
      toc: rendered.toc,
      rendererVersion: this.renderer.version,
    };
    const revisionNo = await this.pages.publish(
      organizationId,
      pageId,
      draft.draftVersion,
      publication,
      SEED_USER_ID,
    );
    if (revisionNo === null) throw new Error(`doc page ${page.key} changed under the seed`);
    await this.pages.saveRevision(
      organizationId,
      spaceId,
      pageId,
      revisionNo,
      publication,
      SEED_USER_ID,
    );
    // The title is a section of its own, so a search for a page's name finds the page.
    await this.pages.saveSections(organizationId, spaceId, pageId, [
      { anchor: null, heading: draft.title, body: draft.description ?? "" },
      ...rendered.sections,
    ]);
    await this.events.publish(actor, {
      name: "doc.page.published",
      payload: { spaceId, pageId, revisionNo },
    });
    counts.published++;
  }

  // Read back after commit, so a page that did not publish or a link to a heading the
  // renderer never made is reported here rather than found by a reader.
  private async verify(
    organizationId: OrganizationId,
    spaces: readonly DocSeedSpace[],
  ): Promise<string[]> {
    const problems: string[] = [];
    const idByRoute = new Map<string, DocPageId>();
    for (const space of spaces) {
      const row = await this.spaces.findBySlug(organizationId, space.slug);
      if (!row) continue;
      const byKey = DocSpaceSeed.keyed(await this.pages.listBySpace(organizationId, row.id));
      for (const page of space.pages) {
        const node = byKey.get(page.key);
        if (page.kind === "page" && node)
          idByRoute.set(`/doc/${space.slug}/${page.route}`, node.id);
      }
    }
    const html = new Map<string, string | null>();
    const read = async (route: string) => {
      if (!html.has(route)) {
        const id = idByRoute.get(route);
        const published = id ? await this.pages.findPublished(organizationId, id) : null;
        html.set(route, published?.html ?? null);
      }
      return html.get(route) ?? null;
    };
    for (const space of spaces) {
      for (const page of space.pages) {
        if (page.kind !== "page") continue;
        const from = `/doc/${space.slug}/${page.route}`;
        if ((await read(from)) === null) problems.push(`${from} did not publish`);
        for (const [, route = "", hash] of page.markdown.matchAll(ROUTE)) {
          const target = await read(route);
          if (target === null) {
            problems.push(`${from} links to ${route}, which is not published`);
          } else if (hash && !target.includes(`id="${decodeURIComponent(hash.slice(1))}"`)) {
            problems.push(`${from} links to ${route}${hash}, which has no such heading`);
          }
        }
      }
    }
    return problems;
  }
}
