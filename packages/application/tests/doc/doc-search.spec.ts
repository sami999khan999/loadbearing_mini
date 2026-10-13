import { type DocNavNodeDto, Identifiers } from "@loadbearing/contracts";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type { SearchMode } from "../../src/ai/index.js";
import type { DocCache } from "../../src/doc/doc.cache.js";
import { DocFeaturePolicy } from "../../src/doc/doc-feature.policy.js";
import type { DocPageRepository, DocSearchMatch } from "../../src/doc/doc-page.repository.js";
import { DocSearch } from "../../src/doc/doc-search.js";
import type { DocSpaceRecord, DocSpaceSummary } from "../../src/doc/doc-space.repository.js";
import type { FlagCache } from "../../src/flag/index.js";
import type { EntitlementRepository } from "../../src/platform/index.js";
import type {
  CacheStore,
  ChunkFilter,
  EmbeddingProvider,
  SearchHit,
  VectorStore,
} from "../../src/port/index.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const USER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const id = (n: number) => `018f8c00-0000-7000-8000-${String(n).padStart(12, "0")}`;

const leaf = (n: number, path: string, linked = false): DocNavNodeDto => ({
  id: Identifiers.docPageId.parse(id(n)),
  kind: "page",
  title: path,
  icon: null,
  path,
  url: null,
  revisionNo: 1,
  children: [],
  ...(linked
    ? { access: { module: null, permission: "rbac.role.manage", flag: null, plan: null } }
    : {}),
});

const space = (n: number, slug: string, nav: DocNavNodeDto[]) =>
  ({
    id: Identifiers.docSpaceId.parse(id(n)),
    organizationId: ORG,
    slug,
    title: slug.toUpperCase(),
    access: null,
    nav,
  }) as unknown as DocSpaceRecord;

const guide = space(100, "guide", [leaf(1, "install")]);
const api = space(200, "api", [leaf(2, "keys"), leaf(3, "admin", true)]);
const other = space(300, "other", [leaf(4, "secret")]);

const match = (page: number, spaceId: number): DocSearchMatch => ({
  pageId: Identifiers.docPageId.parse(id(page)),
  spaceId: Identifiers.docSpaceId.parse(id(spaceId)),
  anchor: null,
  heading: null,
  excerpt: "",
  rank: 1,
});

const noCache = {} as CacheStore;
const LEXICAL: SearchMode = { kind: "lexical" };

// The vector index as `DocSearch` sees it: what it was asked, and the hits it answers.
const vectorsAnswering = (hits: readonly SearchHit[], filters: ChunkFilter[] = []) =>
  ({
    search: (
      _org: unknown,
      _embedding: unknown,
      _model: string,
      _goals: unknown,
      _limit: number,
      filter: ChunkFilter,
    ) => {
      filters.push(filter);
      return Promise.resolve(hits);
    },
  }) as unknown as VectorStore;

const embeddingsThat = (embed: () => Promise<readonly (readonly number[])[]>) =>
  ({ model: "m", dimensions: 2, embed }) as unknown as EmbeddingProvider;

const docHit = (page: number, spaceId: number, content = "about it"): SearchHit => ({
  id: `chunk-${page}`,
  sourceId: id(page),
  content,
  score: 0.9,
  metadata: { sourceType: "doc", spaceId: id(spaceId) },
});

const search = (
  asked: unknown[][] = [],
  options: {
    text?: readonly DocSearchMatch[];
    mode?: SearchMode;
    vectors?: VectorStore;
  } = {},
) => {
  const pages = {
    search: (_org: unknown, _query: string, spaceIds: readonly unknown[]) => {
      asked.push([...spaceIds]);
      return Promise.resolve(
        options.text ?? [match(1, 100), match(2, 200), match(3, 200), match(4, 300)],
      );
    },
  } as unknown as DocPageRepository;
  const cache = {
    space: (_org: unknown, slug: string) =>
      Promise.resolve([guide, api, other].find((each) => each.slug === slug) ?? null),
  } as unknown as DocCache;
  const features = new DocFeaturePolicy({} as FlagCache, {} as EntitlementRepository, noCache);
  return {
    features,
    search: new DocSearch(
      pages,
      cache,
      features,
      options.mode ?? LEXICAL,
      options.vectors ?? vectorsAnswering([]),
    ),
  };
};

const reader = new Principal(
  ORG,
  USER,
  CapabilitySet.from({
    wildcard: false,
    org: { grants: ["doc.page.read"], denies: [] },
    goals: {},
  }),
);

describe("DocSearch across the whole docs", () => {
  // Every readable space at once, and nothing from a space the caller did not allow, nor a
  // page whose feature the reader lacks.
  it("finds hits in every allowed space and drops the rest", async () => {
    const { features, search: docs } = search();
    const allowed = [guide, api] as unknown as DocSpaceSummary[];
    const hits = await docs.run(ORG, "x", allowed, 10, features.scope(reader));
    expect(hits.map((hit) => `${hit.spaceSlug}/${hit.path}`)).toEqual([
      "guide/install",
      "api/keys",
    ]);
  });

  // `FC.10`. Ranked across the tenant, a hidden space's matches took the window first.
  it("asks the index for the allowed spaces only", async () => {
    const asked: unknown[][] = [];
    const { features, search: docs } = search(asked);
    await docs.run(
      ORG,
      "x",
      [guide, api] as unknown as DocSpaceSummary[],
      10,
      features.scope(reader),
    );
    expect(asked).toEqual([[guide.id, api.id]]);
  });
});

describe("DocSearch with the semantic index (`DC.2`)", () => {
  const allowed = [guide, api] as unknown as DocSpaceSummary[];

  // A page found by meaning alone, with no word of the query in it, still reaches the reader.
  it("adds a page only the vector index found", async () => {
    const { features, search: docs } = search([], {
      text: [match(1, 100)],
      mode: { kind: "semantic", provider: embeddingsThat(() => Promise.resolve([[1, 0]])) },
      vectors: vectorsAnswering([docHit(2, 200, "## Keys\n\nRotate **every** key")]),
    });

    const hits = await docs.run(ORG, "x", allowed, 10, features.scope(reader), true);

    expect(hits.map((hit) => hit.path)).toEqual(["install", "keys"]);
    expect(hits[1]?.excerpt).toBe("Keys Rotate every key");
  });

  // Fused by rank: a page near the top of both lists beats one that leads only one of them.
  it("ranks a page both halves found above one only full text found", async () => {
    const { features, search: docs } = search([], {
      text: [match(1, 100), match(2, 200)],
      mode: { kind: "semantic", provider: embeddingsThat(() => Promise.resolve([[1, 0]])) },
      vectors: vectorsAnswering([docHit(2, 200)]),
    });

    const hits = await docs.run(ORG, "x", allowed, 10, features.scope(reader), true);

    expect(hits.map((hit) => hit.path)).toEqual(["keys", "install"]);
  });

  // The space filter runs on the index's input set: a hidden space is never ranked.
  it("asks the vector index for doc chunks in the allowed spaces only", async () => {
    const filters: ChunkFilter[] = [];
    const { features, search: docs } = search([], {
      mode: { kind: "semantic", provider: embeddingsThat(() => Promise.resolve([[1, 0]])) },
      vectors: vectorsAnswering([], filters),
    });

    await docs.run(ORG, "x", allowed, 10, features.scope(reader), true);

    expect(filters).toEqual([
      { kind: "within", sourceType: "doc", key: "spaceId", values: [guide.id, api.id] },
    ]);
  });

  // A provider outage costs the meaning half, never the search.
  it("falls back to full text when the provider fails", async () => {
    const { features, search: docs } = search([], {
      mode: {
        kind: "semantic",
        provider: embeddingsThat(() => Promise.reject(new Error("provider down"))),
      },
    });

    const hits = await docs.run(ORG, "x", allowed, 10, features.scope(reader), true);

    expect(hits.map((hit) => hit.path)).toEqual(["install", "keys"]);
  });

  it("leaves the platform's search on full text", async () => {
    const filters: ChunkFilter[] = [];
    const { features, search: docs } = search([], {
      mode: { kind: "semantic", provider: embeddingsThat(() => Promise.resolve([[1, 0]])) },
      vectors: vectorsAnswering([docHit(2, 200)], filters),
    });

    await docs.run(ORG, "x", allowed, 10, features.scope(reader));

    expect(filters).toEqual([]);
  });
});
