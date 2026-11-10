import { ChunkSource, type SearchDocumentsUseCase, type SearchMode } from "../ai/index.js";
import {
  type DocCache,
  type DocFeaturePolicy,
  type DocPageRepository,
  DocRules,
  type DocSectionRecord,
  type DocSpaceRecord,
  type SearchDocsUseCase,
} from "../doc/index.js";
import type { DocPageId, DocSearchHitDto } from "../import.js";
import type { SearchHit, VectorStore } from "../port/index.js";
import type { Principal } from "../primitive/index.js";
import type { AssistantSource } from "./assistant-message.repository.js";
import type { AssistantPassage } from "./assistant-prompt.builder.js";

// Each half's share. The prompt builder spends its window in this order and drops the rest.
const PER_HALF = 6;
// The palette's own cap on a docs query.
const QUERY_MAX = 200;
// Full text ANDs every term, so a whole question matches almost nothing: the content words,
// then the longest two when those found nothing.
const KEYWORDS = 6;
const FALLBACK_KEYWORDS = 2;
const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "a an and are as at be but by can could did do does for from had has have how i if in " +
    "into is it its me my no not of on or our should so than that the their them then there " +
    "these they this to was we were what when where which who why will with would you your"
  ).split(" "),
);

export interface AssistantRetrieved {
  readonly passages: readonly AssistantPassage[];
  // One per passage, in the same order: what the answer names and a reopen re-checks.
  readonly sources: readonly AssistantSource[];
}

interface Found {
  readonly passage: AssistantPassage;
  readonly source: AssistantSource;
}

// What the asker may read, found by searching *as them*: Docs through `SearchDocsUseCase`,
// which filters by space before it ranks, and documents through their goal scope.
export class AssistantRetrieval {
  public constructor(
    private readonly docs: SearchDocsUseCase,
    private readonly documents: SearchDocumentsUseCase,
    private readonly pages: DocPageRepository,
    private readonly spaces: DocCache,
    private readonly features: DocFeaturePolicy,
    private readonly vectors: VectorStore,
    private readonly mode: SearchMode,
  ) {}

  // A half the asker holds no key for, or whose provider failed, adds nothing: an answer
  // from one half beats no answer.
  public async find(asker: Principal, question: string): Promise<AssistantRetrieved> {
    const [docs, documents] = await Promise.all([
      this.fromDocs(asker, question).catch(() => []),
      this.fromDocuments(asker, question).catch(() => []),
    ]);

    // Alternated, so neither half's tail pushes the other's best out of the window.
    const found: Found[] = [];
    for (let index = 0; index < Math.max(docs.length, documents.length); index += 1) {
      const doc = docs[index];
      const document = documents[index];
      if (doc) found.push(doc);
      if (document) found.push(document);
    }
    return {
      passages: found.map((entry) => entry.passage),
      sources: found.map((entry) => entry.source),
    };
  }

  // For a reopened thread: each source is checked as `viewer` may see it now, one answer
  // each in order. A space or source read once is reused for the rest.
  public async available(
    viewer: Principal,
    sources: readonly AssistantSource[],
  ): Promise<readonly boolean[]> {
    const navs = new Map<string, Promise<DocSpaceRecord | null>>();
    const result: boolean[] = [];

    for (const source of sources) {
      if (source.kind === "doc") {
        const slug = source.path?.split("/")[0] ?? "";
        if (!viewer.can("doc.page.read") || slug.length === 0) {
          result.push(false);
          continue;
        }
        let space = navs.get(slug);
        if (!space) {
          space = this.visibleSpace(viewer, slug);
          navs.set(slug, space);
        }
        const visible = await space;
        result.push(
          visible !== null && DocRules.locate(visible.nav, source.id as DocPageId) !== null,
        );
        continue;
      }

      const indexed = await this.vectors.sourceOf(viewer.organizationId, source.id);
      result.push(
        indexed !== null &&
          !ChunkSource.isGuarded(indexed.sourceType) &&
          viewer.can("ai.embedding.read", indexed.goalId ?? undefined),
      );
    }

    return result;
  }

  private async fromDocs(asker: Principal, question: string): Promise<readonly Found[]> {
    if (!asker.can("doc.page.read")) return [];
    const hits = await this.searchDocs(asker, question);
    if (hits.length === 0) return [];

    const sections = await this.pages.listSections(asker.organizationId, [
      ...new Set(hits.map((hit) => hit.pageId)),
    ]);
    const byPage = new Map<string, DocSectionRecord[]>();
    for (const section of sections) {
      byPage.set(section.pageId, [...(byPage.get(section.pageId) ?? []), section]);
    }

    return hits.map((hit) => {
      const page = byPage.get(hit.pageId) ?? [];
      // A title or meaning match names no section, so the page is read from its start.
      const text =
        hit.anchor === null
          ? page.map((section) => section.body).join("\n\n")
          : (page.find((section) => section.anchor === hit.anchor)?.body ?? hit.excerpt);
      const title = hit.heading ? `${hit.title} — ${hit.heading}` : hit.title;
      return {
        passage: { title, text: text.length > 0 ? text : hit.excerpt },
        source: { kind: "doc", id: hit.pageId, title, path: `${hit.spaceSlug}/${hit.path}` },
      };
    });
  }

  private async searchDocs(
    asker: Principal,
    question: string,
  ): Promise<readonly DocSearchHitDto[]> {
    // Meaning is ranked from the question as asked; full text from its content words.
    if (this.mode.kind === "semantic") {
      const { items } = await this.docs.execute(asker, {
        query: question.slice(0, QUERY_MAX),
        limit: PER_HALF,
      });
      return items;
    }
    for (const query of AssistantRetrieval.queries(question)) {
      const { items } = await this.docs.execute(asker, { query, limit: PER_HALF });
      if (items.length > 0) return items;
    }
    return [];
  }

  private async fromDocuments(asker: Principal, question: string): Promise<readonly Found[]> {
    if (!asker.can("ai.embedding.read")) return [];
    let hits: readonly SearchHit[] = [];
    const queries =
      this.mode.kind === "semantic" ? [question] : AssistantRetrieval.queries(question);
    for (const query of queries) {
      hits = await this.documents.execute(asker, { query, limit: PER_HALF });
      if (hits.length > 0) break;
    }

    return hits.map((hit) => {
      const named = hit.metadata.title;
      const title = typeof named === "string" && named.length > 0 ? named : hit.sourceId;
      return {
        passage: { title, text: hit.content },
        source: { kind: "document", id: hit.sourceId, title, path: null },
      };
    });
  }

  // The space as `viewer` may see it, its tree filtered by their features; null when hidden.
  private async visibleSpace(viewer: Principal, slug: string): Promise<DocSpaceRecord | null> {
    const space = await this.spaces.space(viewer.organizationId, slug);
    if (!space || !DocRules.isVisible(space, viewer.userId)) return null;
    const scope = this.features.scope(viewer);
    if (!(await this.features.allows(scope, space.access))) return null;
    return { ...space, nav: await this.features.filterNav(scope, space.nav) };
  }

  // The content words, then the longest few: two lexical tries at most, never one per word.
  private static queries(question: string): readonly string[] {
    const words = (question.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
      (word) => word.length > 1 && !STOPWORDS.has(word),
    );
    const unique = [...new Set(words)];
    if (unique.length === 0) return [];
    const first = unique.slice(0, KEYWORDS).join(" ");
    if (unique.length <= FALLBACK_KEYWORDS) return [first];
    const longest = [...unique]
      .sort((left, right) => right.length - left.length)
      .slice(0, FALLBACK_KEYWORDS)
      .join(" ");
    return [first, longest];
  }
}
