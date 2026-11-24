---
title: Embedding providers and lexical search
description: The three ways lite searches documents — lexical with no provider, OpenAI, or Gemini — how the container picks one, what switching providers does to the corpus, and the trade-offs.
---

# Embedding providers and lexical search

Semantic search is one switch, `EMBEDDING_PROVIDER`, read once by the container.

| `EMBEDDING_PROVIDER` | Search | Indexing | Needs |
|---|---|---|---|
| `none` (the default) | Postgres full-text search over the chunk text | text only, `embedding` null | nothing |
| `openai` | cosine distance over `vector(1536)` | text and a vector | `EMBEDDING_API_KEY` |
| `gemini` | the same | the same | `EMBEDDING_API_KEY` |

`Container.buildSearchMode` yields a `SearchMode` — `lexical`, or `semantic` with an `EmbeddingProvider` —
and the index, search and re-embed use-cases branch on that alone, naming no vendor. A third provider is
one adapter and one `case`.

## The two adapters

Both `fetch` the REST endpoint (no SDK, no catalog entry):

- **`OpenAiEmbeddingProvider`** — `/embeddings`, batches of 96, `dimensions` cut to the column; ignores
  `purpose` (queries and documents embed alike).
- **`GeminiEmbeddingProvider`** — `models/<model>:batchEmbedContents`, batches of 100, key in
  `x-goog-api-key`, `outputDimensionality` to share `vector(1536)`; `purpose` → `taskType`
  (`RETRIEVAL_DOCUMENT`/`RETRIEVAL_QUERY` — mixing them costs recall).

A failed or short response is retryable `UNAVAILABLE`. Default models: `text-embedding-3-small`,
`gemini-embedding-001`.

## Lexical search

`document_chunks.search` is a generated `to_tsvector('simple', content)` with a GIN index;
`PgVectorStore.searchText` uses `websearch_to_tsquery('simple', …)` (takes what people type, never throws),
ranks by `ts_rank`, returns the same `SearchHit`, and scopes goals on the input set first. `simple`
because the corpus has no single language — the cost is recall (`invoices` ≠ `invoice`).

## Switching providers

Every chunk records `embedding_model`, and `search` reads only the active model's (another model's
vector is another space), so after a switch old chunks are unread until re-embedded:

```bash
pnpm ops ai-reindex
```

One `reembed` job per organization on the embedding queue (eight attempts with backoff; not queued
twice while pending; requeued on a rerun). `ReembedChunksUseCase` re-embeds, in batches, chunks whose
model is missing or different, keeping stored text so boundaries do not move; under `none` it does
nothing. Chunks written before `0002_chunk_embedding_model` have no model and count as stale.

**`EMBEDDING_DIMENSIONS` stays 1536** — changing it is an `ALTER TABLE` plus a full re-embed.

## Trade-offs

| | `none` | `openai` | `gemini` |
|---|---|---|---|
| Outbound calls | none | per index and per search | per index and per search |
| Finds a paraphrase | no | yes | yes |
| Cost | none | per token | per token |
| Query and document embedded differently | — | no | yes |
