import { Identifiers } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { and, eq, type Logger } from "drizzle-orm";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgVectorStore } from "../../src/pg/repository/pg-vector.store.js";
import { documentChunks, organizations } from "../../src/pg/schema/index.js";
import { PgUnitOfWork, ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { DATABASE_URL, openDatabase, seedOrganizationId, seedTenant } from "../support/database.js";

// The model every chunk below is written by, and every search asks for.
const MODEL = "spec-model";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();

// Routed repositories refuse to pick a pool with no shard in scope, which is the
// tripwire working. One node here, so entering it is the whole placement.
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });

// Both hooks, and registered first: vitest runs every `beforeAll` before any
// `beforeEach`, and a fixture built in one of those makes routed queries too.
beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

// Captures the SQL the store actually issued, so the EXPLAIN below runs the query under
// test rather than a copy of it that can drift.
class RecordingLogger implements Logger {
  public last: { query: string; params: unknown[] } | null = null;

  public logQuery(query: string, params: unknown[]): void {
    this.last = { query, params };
  }
}

const recorder = new RecordingLogger();
let database: Database;
let store: PgVectorStore;

// A unit vector on one axis, plus a near neighbour and an orthogonal one. Cosine
// similarity is then 1, ~0.99, and 0 — enough to prove ordering and the floor.
const axis = (index: number): number[] =>
  Array.from({ length: 1536 }, (_, i) => (i === index ? 1 : 0));

const blend = (a: number, b: number): number[] =>
  Array.from({ length: 1536 }, (_, i) => (i === a ? 0.99 : i === b ? 0.14 : 0));

beforeAll(() => {
  database = openDatabase(recorder);
  store = new PgVectorStore(DatabaseCluster.single(database), new TransactionScope(), shards);
});

afterAll(async () => {
  await database.close();
});

const seedOrg = () => seedOrganizationId(database);

// Every source type: what a store-level spec means when the filter is not the subject.
const ANY = Object.freeze({ kind: "except", sourceTypes: [] } as const);

describe("PgVectorStore", () => {
  it("returns org-wide chunks only when the permitted scope is empty", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();
    const goalId = Identifiers.goalId.parse(Uuid.v7());

    await store.upsert(organizationId, [
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "org-wide chunk",
        embedding: axis(0),
        embeddingModel: MODEL,
        metadata: { chunkIndex: 0, sourceType: "note" },
      },
      {
        id: Uuid.v7(),
        sourceId,
        goalId,
        content: "goal-scoped chunk",
        embedding: axis(0),
        embeddingModel: MODEL,
        metadata: { chunkIndex: 1, sourceType: "note" },
      },
    ]);

    const withoutScope = await store.search(organizationId, axis(0), MODEL, [], 10, ANY);
    expect(withoutScope.map((h) => h.content)).toEqual(["org-wide chunk"]);

    const withScope = await store.search(organizationId, axis(0), MODEL, [goalId], 10, ANY);
    expect(withScope.map((h) => h.content).sort()).toEqual(["goal-scoped chunk", "org-wide chunk"]);

    await store.deleteBySource(organizationId, sourceId);
  });

  it("orders by similarity and drops everything under the floor", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();

    await store.upsert(organizationId, [
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "exact",
        embedding: axis(1),
        embeddingModel: MODEL,
        metadata: { chunkIndex: 0 },
      },
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "near",
        embedding: blend(1, 2),
        embeddingModel: MODEL,
        metadata: { chunkIndex: 1 },
      },
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "orthogonal",
        embedding: axis(3),
        embeddingModel: MODEL,
        metadata: { chunkIndex: 2 },
      },
    ]);

    const hits = await store.search(organizationId, axis(1), MODEL, [], 10, ANY);

    // "orthogonal" scores 0, below MIN_SCORE, so the floor removes it entirely.
    expect(hits.map((h) => h.content)).toEqual(["exact", "near"]);
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 1);

    await store.deleteBySource(organizationId, sourceId);
  });

  it("does not leak across organizations", async () => {
    const organizationId = await seedOrg();
    const otherOrg = Identifiers.organizationId.parse(Uuid.v7());
    const sourceId = Uuid.v7();

    await database.client
      .insert(organizations)
      .values({ id: otherOrg, slug: `other-${sourceId}`, name: "Other" });
    await seedTenant(database, otherOrg);

    await store.upsert(otherOrg, [
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "other tenant chunk",
        embedding: axis(0),
        embeddingModel: MODEL,
        metadata: { chunkIndex: 0 },
      },
    ]);

    const hits = await store.search(organizationId, axis(0), MODEL, [], 10, ANY);
    expect(hits.map((h) => h.content)).not.toContain("other tenant chunk");

    await store.deleteBySource(otherOrg, sourceId);
    await database.client.delete(organizations).where(eq(organizations.id, otherOrg));
  });

  // `ORDER BY (1 - (embedding <=> $1)) DESC` is an expression no HNSW index can serve.
  // See docs/reference/pgvector.md for why the assertion is on the shape.
  it("orders on the distance operator, in the shape the HNSW index can serve", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();

    await store.upsert(
      organizationId,
      Array.from({ length: 32 }, (_, i) => ({
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: `chunk ${i}`,
        embedding: axis(i),
        embeddingModel: MODEL,
        metadata: { chunkIndex: i },
      })),
    );

    await store.search(organizationId, axis(0), MODEL, [], 10, ANY);

    const issued = recorder.last;
    if (!issued) throw new Error("expected the search above to have been logged");

    // Ascending on the bare operator, and no inversion anywhere in the ordering.
    const ordering = /order by\s+"\w+"\."embedding"\s*<=>\s*\$\d+\s+asc/i;
    expect(issued.query).toMatch(ordering);
    expect(issued.query).not.toMatch(/order by[\s\S]*desc/i);
    expect(issued.query).not.toMatch(/order by[\s\S]*1 -/i);

    // And the plan agrees: the sort key is the operator, not an expression over it.
    const pool = new Pool({ connectionString: DATABASE_URL });
    const client = await pool.connect();

    try {
      const explained = await client.query(`explain ${issued.query}`, issued.params);
      const plan = explained.rows.map((row) => Object.values(row).join(" ")).join(" | ");
      // The qualifier is optional: the scan is on the tenant's partition under an alias
      // since `0023`, so the plan reads `document_chunks.embedding` rather than bare.
      const sortKey = /Sort Key: \(\((?:\w+\.)?embedding <=> [^)]*\)\)/.test(plan);

      // And the index name is generated on the partition, so the suffix is what is
      // stable — one HNSW graph per tenant, which is the better shape here.
      expect(sortKey || plan.includes("_embedding_idx")).toBe(true);
    } finally {
      client.release();
      await pool.end();
      await store.deleteBySource(organizationId, sourceId);
    }
  });

  it("upsert replaces content for an existing id", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();
    const id = Uuid.v7();

    const chunk = {
      id,
      sourceId,
      goalId: null,
      content: "first",
      embedding: axis(5),
      embeddingModel: MODEL,
      metadata: { chunkIndex: 0 },
    };

    await store.upsert(organizationId, [chunk]);
    await store.upsert(organizationId, [{ ...chunk, content: "second" }]);

    const rows = await database.client
      .select({ content: documentChunks.content })
      .from(documentChunks)
      .where(and(eq(documentChunks.id, id), eq(documentChunks.organizationId, organizationId)));

    expect(rows).toEqual([{ content: "second" }]);

    await store.deleteBySource(organizationId, sourceId);
  });

  // `CR.8`, `CR.33` and `DC.2` read these off one chunk: where the source sits, which request
  // wrote it, and its source type. A chunk from before versions reads as null, never as zero.
  it("answers where a source is indexed and at which version", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();
    const goalId = Identifiers.goalId.parse(Uuid.v7());
    const chunk = (version?: number) => ({
      id: Uuid.v7(),
      sourceId,
      goalId,
      content: "versioned",
      embedding: axis(6),
      embeddingModel: MODEL,
      metadata: { chunkIndex: 0, ...(version === undefined ? {} : { version }) },
    });

    expect(await store.sourceOf(organizationId, sourceId)).toBeNull();

    await store.upsert(organizationId, [chunk()]);
    expect(await store.sourceOf(organizationId, sourceId)).toEqual({
      goalId,
      sourceType: "unknown",
      version: null,
    });

    await store.deleteBySource(organizationId, sourceId);
    await store.upsert(organizationId, [chunk(1_790_000_000_000)]);
    expect(await store.sourceOf(organizationId, sourceId)).toEqual({
      goalId,
      sourceType: "unknown",
      version: 1_790_000_000_000,
    });

    await store.deleteBySource(organizationId, sourceId);
  });
});

// `LT4.5`: a vector from another model is a point in another space. It is never compared,
// and the lexical path finds a chunk that has no vector at all.
describe("PgVectorStore — models and text", () => {
  it("never compares a vector another model wrote", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();

    await store.upsert(organizationId, [
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "this model",
        embedding: axis(0),
        embeddingModel: MODEL,
        metadata: { chunkIndex: 0 },
      },
      {
        id: Uuid.v7(),
        sourceId,
        goalId: null,
        content: "another model",
        embedding: axis(0),
        embeddingModel: "another-model",
        metadata: { chunkIndex: 1 },
      },
    ]);

    const hits = await store.search(organizationId, axis(0), MODEL, [], 10, ANY);
    expect(hits.map((h) => h.content)).toEqual(["this model"]);

    await store.deleteBySource(organizationId, sourceId);
  });

  it("finds text with no vector, and lists it as stale for the active model", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();
    const id = Uuid.v7();

    await store.upsert(organizationId, [
      {
        id,
        sourceId,
        goalId: null,
        content: "quarterly invoices for the harbour office",
        embedding: null,
        embeddingModel: null,
        metadata: { chunkIndex: 0 },
      },
    ]);

    const hits = await store.searchText(organizationId, "harbour invoices", [], 10, ANY);
    expect(hits.map((h) => h.id)).toEqual([id]);
    expect(await store.searchText(organizationId, "nothing like it", [], 10, ANY)).toEqual([]);

    expect((await store.stale(organizationId, MODEL, 10)).map((chunk) => chunk.id)).toContain(id);
    await store.saveEmbeddings(organizationId, [{ id, embedding: axis(2) }], MODEL);
    expect((await store.stale(organizationId, MODEL, 10)).map((chunk) => chunk.id)).not.toContain(
      id,
    );
    expect(
      (await store.search(organizationId, axis(2), MODEL, [], 10, ANY)).map((h) => h.id),
    ).toEqual([id]);

    await store.deleteBySource(organizationId, sourceId);
  });
});

describe("PgVectorStore.lockSource", () => {
  // The second transaction cannot take the lock until the first ends, even though the
  // source has no chunks yet and a row lock would have nothing to hold.
  it("makes a second job for the same source wait for the first to finish", async () => {
    const organizationId = await seedOrg();
    const sourceId = Uuid.v7();
    const events: string[] = [];
    const scope = new TransactionScope();
    const locking = new PgVectorStore(DatabaseCluster.single(database), scope, shards);
    const unit = new PgUnitOfWork(DatabaseCluster.single(database), scope, shards, "routed");

    const first = unit.run(async () => {
      await locking.lockSource(organizationId, sourceId);
      events.push("first locked");
      await new Promise((resolve) => setTimeout(resolve, 400));
      events.push("first done");
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    const second = unit.run(async () => {
      await locking.lockSource(organizationId, sourceId);
      events.push("second locked");
    });
    await Promise.all([first, second]);

    expect(events).toEqual(["first locked", "first done", "second locked"]);
  });

  it("does not make a different source wait", async () => {
    const organizationId = await seedOrg();
    const scope = new TransactionScope();
    const locking = new PgVectorStore(DatabaseCluster.single(database), scope, shards);
    const unit = new PgUnitOfWork(DatabaseCluster.single(database), scope, shards, "routed");
    const events: string[] = [];

    const first = unit.run(async () => {
      await locking.lockSource(organizationId, Uuid.v7());
      await new Promise((resolve) => setTimeout(resolve, 400));
      events.push("first done");
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    await unit.run(async () => {
      await locking.lockSource(organizationId, Uuid.v7());
      events.push("other locked");
    });
    await first;

    expect(events).toEqual(["other locked", "first done"]);
  });
});

describe("PgVectorStore filters (`DC.2`)", () => {
  // A Docs page is org-wide by goal, so only the source-type filter keeps a private space's
  // text out of the shared document search.
  it("leaves a guarded source type out of the shared corpus, and finds it only within scope", async () => {
    const organizationId = await seedOrg();
    const note = Uuid.v7();
    const page = Uuid.v7();
    const hidden = Uuid.v7();
    // A word no other spec writes: the organization is shared, and its chunks may outlive a run.
    const word = `filterspec${Date.now()}`;
    const chunk = (sourceId: string, sourceType: string, extra: Record<string, unknown>) => ({
      id: Uuid.v7(),
      sourceId,
      goalId: null,
      content: `${word} ${sourceType}`,
      embedding: axis(0),
      embeddingModel: MODEL,
      metadata: { chunkIndex: 0, sourceType, ...extra },
    });
    await store.upsert(organizationId, [
      chunk(note, "note", {}),
      chunk(page, "doc", { spaceId: "space-a" }),
      chunk(hidden, "doc", { spaceId: "space-b" }),
    ]);

    // Cleaned up whatever the assertions say: the organization is shared with every spec here.
    try {
      const shared = { kind: "except", sourceTypes: ["doc"] } as const;
      const docs = {
        kind: "within",
        sourceType: "doc",
        key: "spaceId",
        values: ["space-a"],
      } as const;
      const noSpace = { kind: "within", sourceType: "doc", key: "spaceId", values: [] } as const;

      const sources = async (hits: Promise<readonly { sourceId: string }[]>) =>
        (await hits).map((hit) => hit.sourceId);

      expect(await sources(store.search(organizationId, axis(0), MODEL, [], 10, shared))).toEqual([
        note,
      ]);
      expect(await sources(store.searchText(organizationId, word, [], 10, shared))).toEqual([note]);
      expect(await sources(store.search(organizationId, axis(0), MODEL, [], 10, docs))).toEqual([
        page,
      ]);
      expect(await sources(store.searchText(organizationId, word, [], 10, docs))).toEqual([page]);
      expect(await store.search(organizationId, axis(0), MODEL, [], 10, noSpace)).toEqual([]);

      expect((await store.sourceOf(organizationId, page))?.sourceType).toBe("doc");
    } finally {
      for (const sourceId of [note, page, hidden]) {
        await store.deleteBySource(organizationId, sourceId);
      }
    }
  });
});
