import type { DocSearchHitDto, OrganizationId } from "@loadbearing/contracts";
import { describe, expect, it } from "vitest";
import type { SearchDocumentsUseCase, SearchMode } from "../../src/ai/index.js";
import { AssistantRetrieval } from "../../src/assistant/assistant-retrieval.js";
import type {
  DocCache,
  DocFeaturePolicy,
  DocPageRepository,
  DocSectionRecord,
  SearchDocsUseCase,
} from "../../src/doc/index.js";
import type { SearchHit, VectorStore } from "../../src/port/index.js";
import { ADA, GRACE, ORG, principal } from "./assistant-harness.js";

const hit = (over: Partial<DocSearchHitDto> = {}): DocSearchHitDto => ({
  pageId: "page-1" as never,
  spaceSlug: "ops",
  spaceTitle: "Ops",
  path: "keys",
  title: "Keys",
  heading: "Rotation",
  anchor: "rotation",
  excerpt: "…rotate…",
  ...over,
});

const SECTIONS: readonly DocSectionRecord[] = [
  { pageId: "page-1" as never, anchor: null, heading: null, body: "Intro." },
  { pageId: "page-1" as never, anchor: "rotation", heading: "Rotation", body: "Every quarter." },
];

const node = (id: string, children: readonly unknown[] = []) => ({ id, title: id, children });

const build = (
  options: {
    readonly mode?: SearchMode;
    readonly docHits?: (query: string) => readonly DocSearchHitDto[];
    readonly documentHits?: (query: string) => readonly SearchHit[];
    readonly spaces?: Readonly<Record<string, unknown>>;
    readonly indexed?: Readonly<Record<string, { goalId: string | null; sourceType: string }>>;
    readonly hidden?: readonly string[];
  } = {},
) => {
  const docQueries: string[] = [];
  const documentQueries: string[] = [];
  const docs = {
    execute: (_actor: unknown, input: { query: string }) => {
      docQueries.push(input.query);
      return Promise.resolve({ items: options.docHits?.(input.query) ?? [] });
    },
  } as unknown as SearchDocsUseCase;
  const documents = {
    execute: (_actor: unknown, input: { query: string }) => {
      documentQueries.push(input.query);
      return Promise.resolve(options.documentHits?.(input.query) ?? []);
    },
  } as unknown as SearchDocumentsUseCase;
  const pages = {
    listSections: () => Promise.resolve(SECTIONS),
  } as unknown as DocPageRepository;
  const cache = {
    space: (_org: OrganizationId, slug: string) => Promise.resolve(options.spaces?.[slug] ?? null),
  } as unknown as DocCache;
  const features = {
    scope: (viewer: unknown) => ({ viewer }),
    allows: () => Promise.resolve(true),
    filterNav: (_scope: unknown, nav: readonly { id: string }[]) =>
      Promise.resolve(nav.filter((entry) => !(options.hidden ?? []).includes(entry.id))),
  } as unknown as DocFeaturePolicy;
  const vectors = {
    sourceOf: (_org: OrganizationId, id: string) => Promise.resolve(options.indexed?.[id] ?? null),
  } as unknown as VectorStore;

  const retrieval = new AssistantRetrieval(
    docs,
    documents,
    pages,
    cache,
    features,
    vectors,
    options.mode ?? { kind: "lexical" },
  );
  return { retrieval, docQueries, documentQueries };
};

describe("AssistantRetrieval.find", () => {
  it("searches only the halves the asker holds a key for", async () => {
    const harness = build();
    await harness.retrieval.find(principal(ADA, ["ai.assistant.use"]), "keys rotation");
    expect(harness.docQueries).toEqual([]);
    expect(harness.documentQueries).toEqual([]);
  });

  it("asks full text for the content words, then for the longest two when those found nothing", async () => {
    const harness = build({
      docHits: (query) => (query === "encryption rotated" ? [hit()] : []),
    });
    const found = await harness.retrieval.find(
      principal(),
      "How often are the encryption keys rotated?",
    );
    expect(harness.docQueries).toEqual(["often encryption keys rotated", "encryption rotated"]);
    expect(found.passages).toEqual([{ title: "Keys — Rotation", text: "Every quarter." }]);
    expect(found.sources).toEqual([
      { kind: "doc", id: "page-1", title: "Keys — Rotation", path: "ops/keys" },
    ]);
  });

  it("asks meaning with the question as written when the deployment embeds", async () => {
    const harness = build({
      mode: { kind: "semantic", provider: {} as never },
      docHits: () => [hit({ anchor: null, heading: null })],
    });
    const found = await harness.retrieval.find(principal(), "How often are keys rotated?");
    expect(harness.docQueries).toEqual(["How often are keys rotated?"]);
    // A match that names no section reads the page from its start.
    expect(found.passages[0]?.text).toBe("Intro.\n\nEvery quarter.");
  });

  it("alternates the two halves so neither pushes the other out of the window", async () => {
    const harness = build({
      docHits: () => [hit(), hit({ pageId: "page-2" as never, anchor: null })],
      documentHits: () => [
        {
          id: "c1",
          sourceId: "doc-9",
          content: "From a file.",
          score: 1,
          metadata: { title: "Runbook" },
        },
      ],
    });
    const found = await harness.retrieval.find(principal(), "rotation");
    expect(found.sources.map((source) => source.kind)).toEqual(["doc", "document", "doc"]);
    expect(found.passages[1]).toEqual({ title: "Runbook", text: "From a file." });
  });

  it("keeps the other half when one fails", async () => {
    const harness = build({
      docHits: () => {
        throw new Error("down");
      },
      documentHits: () => [{ id: "c1", sourceId: "doc-9", content: "x", score: 1, metadata: {} }],
    });
    const found = await harness.retrieval.find(principal(), "rotation");
    expect(found.sources).toEqual([{ kind: "document", id: "doc-9", title: "doc-9", path: null }]);
  });
});

describe("AssistantRetrieval.available", () => {
  const space = (over: Record<string, unknown> = {}) => ({
    id: "space-1",
    organizationId: ORG,
    slug: "ops",
    audience: "members",
    createdBy: ADA,
    access: null,
    nav: [node("page-1"), node("page-2", [node("page-3")])],
    ...over,
  });

  it("says, per source and in order, whether the reader may open it now", async () => {
    const { retrieval } = build({
      spaces: { ops: space(), mine: space({ slug: "mine", audience: "owner" }) },
      hidden: ["page-2"],
      indexed: {
        open: { goalId: null, sourceType: "document" },
        goal: { goalId: "018f8c00-0000-7000-8000-0000000000f1", sourceType: "document" },
        guarded: { goalId: null, sourceType: "doc" },
      },
    });

    const answer = await retrieval.available(principal(GRACE), [
      { kind: "doc", id: "page-1", title: "", path: "ops/keys" },
      // Under a page the reader's features now hide, so gone with it.
      { kind: "doc", id: "page-3", title: "", path: "ops/deep" },
      // Another author's private space.
      { kind: "doc", id: "page-1", title: "", path: "mine/keys" },
      { kind: "doc", id: "page-1", title: "", path: "gone/keys" },
      { kind: "document", id: "open", title: "", path: null },
      // An organization-wide grant reaches every goal.
      { kind: "document", id: "goal", title: "", path: null },
      { kind: "document", id: "guarded", title: "", path: null },
      { kind: "document", id: "deleted", title: "", path: null },
    ]);
    expect(answer).toEqual([true, false, false, false, true, true, false, false]);

    // Without the search key, no document is the reader's any more.
    const lost = await retrieval.available(principal(GRACE, ["ai.assistant.use"]), [
      { kind: "document", id: "open", title: "", path: null },
      { kind: "document", id: "goal", title: "", path: null },
    ]);
    expect(lost).toEqual([false, false]);
  });

  it("is false for every doc once the reader loses the docs key", async () => {
    const { retrieval } = build({ spaces: { ops: space() } });
    expect(
      await retrieval.available(principal(ADA, ["ai.assistant.use"]), [
        { kind: "doc", id: "page-1", title: "", path: "ops/keys" },
      ]),
    ).toEqual([false]);
  });
});
