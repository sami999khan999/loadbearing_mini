---
title: pgvector
description: Why the vector store starts inside Postgres, what the permission filter has to run on, the score floor — and the ORDER BY that stops the HNSW index being used at all.
---

# pgvector

`PgVectorStore` is bound when `VECTOR_DRIVER=pgvector` (the only value), inside the domain Postgres.

## Why it starts here

The corpus is **derived** — every chunk rebuilds by re-embedding — so a dedicated vector database later
is a new `src/` folder, a driver-union member and a re-index. `VectorStore.search()` takes the **resolved
goal scope as a parameter**, because a remote store holds no `CapabilitySet` and cannot post-filter.
`SearchDocumentsUseCase` (`document.search`, `/documents`) resolves it with `capabilities.goalsWith()` —
`[]` in the kit, meaning org-wide, not everything.

## The permission filter runs on the input set

```ts
const scope =
  goalIds.length > 0
    ? or(isNull(documentChunks.goalId), inArray(documentChunks.goalId, [...goalIds]))
    : isNull(documentChunks.goalId);
```

**An empty scope means org-wide only, never everything** — a failed scope computation then denies.
Post-retrieval filtering is too late: the model has seen it. The tenant predicate is on every method,
`deleteBySource` included (a `sourceId`-only delete is a silent cross-tenant write).

## `sourceOf` — where a document sits, and which request wrote it

One row off `document_chunks_source_idx`: `goal_id` and `metadata->>'version'` (a source's chunks share
both). `QueueDocumentIndexUseCase` asserts `ai.embedding.write` for the goal the document is in *now* and
the one requested (`CR.8` — writers once replaced any document by id). `IndexDocumentUseCase` skips a job
older than the indexed version (`CR.33`), before the paid call and again in the transaction; the same
version (a retry) proceeds, and pre-version chunks read `null`. Keys are org-scoped today, so the goal
assertion is for a downstream app scoping `ai.embedding.write` per goal.

## The score floor

```ts
private static readonly MIN_SCORE = 0.3;
```

Vector search always returns `limit` rows; without a floor an unrelated question gets the least-unrelated
documents as answers. **`metadata` is untyped**, so `NOT NULL` `sourceType` and `chunkIndex` are narrowed
with a fallback (`String(unknown)` writes `"[object Object]"`).

## Order on the distance, not on the similarity

```ts
const distance = cosineDistance(documentChunks.embedding, [...embedding]);
const similarity = sql<number>`1 - (${distance})`;
…
.where(and(
  eq(documentChunks.organizationId, organizationId),
  scope,
  eq(documentChunks.embeddingModel, model),
  lt(distance, MAX_DISTANCE),
))
.orderBy(asc(distance))
```

`search` compares only the given `model`'s chunks (another model is another space); `searchText` is the
same scope ranked by full-text search, for `EMBEDDING_PROVIDER=none` ([Embedding](embedding.md)).

**pgvector serves HNSW only for `ORDER BY embedding <=> $1 ASC`.** The old `desc(1 - distance)` was an
expression the planner could not match at any size — correct results, so it survived review. The floor is
`MAX_DISTANCE = 1 - MIN_SCORE` on the same `distance`; `1 - distance` survives only as the projected
`score`.

### What the spec can and cannot assert

`tests/vector/pg-vector.store.spec.ts` asserts the **shape** — bare operator ascending, and the plan's
sort key is the operator. It does **not** assert an index scan: **HNSW cannot serve the tenant
predicate**, so the planner chooses by cost, and at spec sizes `document_chunks_goal_null_idx` plus a sort
is rightly cheaper. The shape is what makes HNSW *available* where it wins.
