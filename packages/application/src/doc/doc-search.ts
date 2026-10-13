import { ChunkSource, type SearchMode } from "../ai/index.js";
import type {
  DocNavNodeDto,
  DocPageId,
  DocSearchHitDto,
  DocSpaceId,
  OrganizationId,
} from "../import.js";
import type { VectorStore } from "../port/index.js";
import type { DocCache } from "./doc.cache.js";
import { DocRules } from "./doc.rules.js";
import type { DocFeaturePolicy, DocFeatureScope } from "./doc-feature.policy.js";
import type { DocPageRepository, DocSearchMatch } from "./doc-page.repository.js";
import type { DocSpaceSummary } from "./doc-space.repository.js";

// Reciprocal rank fusion's constant: large enough that being first in one list does not
// outweigh being near the top of both, which is the case a hybrid exists for.
const FUSION_K = 60;
const EXCERPT_LENGTH = 160;

// Matches from the index, resolved to the paths a reader opens. Shared by the tenant's search
// and the platform's, which differ only in which spaces they may show.
export class DocSearch {
  public constructor(
    private readonly pages: DocPageRepository,
    private readonly cache: DocCache,
    private readonly features: DocFeaturePolicy,
    private readonly mode: SearchMode,
    private readonly vectors: VectorStore,
  ) {}

  // `spaces` is what the caller may show; a match outside it is dropped. Twice the limit is
  // asked for, so a caller with most spaces filtered out still gets a page of results.
  // ──
  // `semantic` adds the vector index (`DC.2`). The tenant's own search only: the platform's
  // spaces are another tenant, and the index is read on the requester's node.
  public async run(
    organizationId: OrganizationId,
    query: string,
    spaces: readonly DocSpaceSummary[],
    limit: number,
    scope: DocFeatureScope,
    semantic = false,
  ): Promise<DocSearchHitDto[]> {
    const allowed = new Map(spaces.map((space) => [space.id, space]));
    if (allowed.size === 0) return [];

    const spaceIds = [...allowed.keys()];
    const [text, meaning] = await Promise.all([
      this.pages.search(organizationId, query, spaceIds, limit * 2),
      semantic ? this.meaning(organizationId, query, spaceIds, limit * 2) : Promise.resolve([]),
    ]);
    const matches = meaning.length === 0 ? text : DocSearch.fuse(text, meaning);
    const hits: DocSearchHitDto[] = [];
    const seen = new Set<string>();
    // Each space's tree as this reader may see it, filtered once per search, so a page the
    // reader's features hide never appears, nor anything under it.
    const visible = new Map<string, readonly DocNavNodeDto[]>();

    for (const match of matches) {
      const summary = allowed.get(match.spaceId);
      if (!summary) continue;
      // The tree, from the same cache the reader uses. A page it no longer holds was
      // unpublished or moved after the match was indexed, and is not shown.
      const space = await this.cache.space(organizationId, summary.slug);
      if (!space) continue;
      let nav = visible.get(space.id);
      if (!nav) {
        nav = await this.features.filterNav(scope, space.nav);
        visible.set(space.id, nav);
      }
      const node = DocRules.locate(nav, match.pageId);
      if (!node?.path) continue;

      const key = `${match.pageId}#${match.anchor ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      hits.push({
        pageId: match.pageId,
        spaceSlug: summary.slug,
        spaceTitle: summary.title,
        path: node.path,
        title: node.title,
        heading: match.heading === node.title ? null : match.heading,
        anchor: match.anchor,
        excerpt: match.excerpt,
      });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  // Pages near the query in meaning, inside the visible spaces: the filter runs on the input
  // set, so a hidden space's text is never ranked. A provider that fails leaves full text.
  private async meaning(
    organizationId: OrganizationId,
    query: string,
    spaceIds: readonly DocSpaceId[],
    limit: number,
  ): Promise<readonly DocSearchMatch[]> {
    if (this.mode.kind !== "semantic") return [];
    const { provider } = this.mode;

    try {
      const [embedding] = await provider.embed([query], "query");
      if (!embedding) return [];
      const hits = await this.vectors.search(organizationId, embedding, provider.model, [], limit, {
        kind: "within",
        sourceType: ChunkSource.DOC,
        key: "spaceId",
        values: spaceIds,
      });
      return hits.map((hit, index) => ({
        pageId: hit.sourceId as DocPageId,
        spaceId: String(hit.metadata.spaceId) as DocSpaceId,
        anchor: null,
        heading: null,
        excerpt: DocSearch.excerpt(hit.content),
        rank: limit - index,
      }));
    } catch {
      return [];
    }
  }

  // Reciprocal rank fusion by page: each list contributes 1 / (k + position) for the page's
  // best entry in it. A page's text matches keep their anchors; a meaning-only page is one hit.
  private static fuse(
    text: readonly DocSearchMatch[],
    meaning: readonly DocSearchMatch[],
  ): readonly DocSearchMatch[] {
    const score = new Map<string, number>();
    const credit = (list: readonly DocSearchMatch[]): void => {
      const seen = new Set<string>();
      list.forEach((match, position) => {
        if (seen.has(match.pageId)) return;
        seen.add(match.pageId);
        score.set(match.pageId, (score.get(match.pageId) ?? 0) + 1 / (FUSION_K + position + 1));
      });
    };
    credit(text);
    credit(meaning);

    const byPage = new Map<string, DocSearchMatch[]>();
    for (const match of text)
      byPage.set(match.pageId, [...(byPage.get(match.pageId) ?? []), match]);
    for (const match of meaning) if (!byPage.has(match.pageId)) byPage.set(match.pageId, [match]);

    return [...byPage.entries()]
      .sort(([left], [right]) => (score.get(right) ?? 0) - (score.get(left) ?? 0))
      .flatMap(([, matches]) => matches);
  }

  // A chunk is markdown, and the palette shows plain text: the markup is dropped, then the
  // result is cut at a word boundary.
  private static excerpt(content: string): string {
    const plain = content
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`~|]+/g, " ")
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
    if (plain.length <= EXCERPT_LENGTH) return plain;
    const cut = plain.slice(0, EXCERPT_LENGTH);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
  }
}
