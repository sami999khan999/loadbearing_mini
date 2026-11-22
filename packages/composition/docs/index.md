---
title: "@loadbearing/composition"
description: The hand-written DI root that replaces a framework container. One class, no decorators, no reflection, no module graph — and the only place a vendor swap happens.
---

# `@loadbearing/composition`

The only package knowing both ports and implementations — wiring is its job, so every swap (pgvector →
Qdrant, MinIO → S3, Better Auth → else) is one line here. `grep -rn "PgVectorStore" packages apps` hits only
`infrastructure` (defined) and `composition/src/container/` (named).

| | |
| --- | --- |
| **Package** | `@loadbearing/composition` (private, never published) |
| **Entrypoint** | `src/index.ts` — `Container`, `ContainerConfig`, `HealthReport`, and the test kit |
| **Depends on** | `application`, `auth`, `content`, `contracts`, `core`, `infrastructure`, `observability` |
| **Used by** | `apps/web`, `apps/worker`. **Never** `apps/desktop` — it holds no container |
| **Environment** | server-only; `ServerOnly.assert()` in `src/index.ts` is the runtime tripwire |

```
packages/composition/src/
├── index.ts                          ← ServerOnly.assert(). The container, and the test kit
├── import.ts                         ← every external symbol, both sides of every seam
├── container/
│   ├── index.ts
│   ├── container.config.ts           → ContainerConfig
│   ├── container.ts                  → Container, HealthReport
│   ├── container-health.reader.ts
│   └── test-container.ts             → TestContainer, TestPorts
├── mail/                             ← layout, renderer and the queued mailers
├── push/                             ← the push-notification renderer
├── shard/                            → the organization sharding strategy
└── fake/                             ← one double per port
    ├── index.ts
    ├── direct.unit-of-work.ts        → DirectUnitOfWork
    ├── in-memory-*.ts                → InMemoryCacheStore, InMemoryVectorStore, InMemoryStorageGateway, …
    ├── recording-*.ts                → RecordingActivityLogger, RecordingQueuePublisher,
    │                                   RecordingPartitionArchiveGateway, RecordingMaintenanceGateway, …
    └── stub-*.ts                     → StubEmbeddingProvider, StubSessionResolver, StubMailRenderer, …

packages/composition/tests/
├── container/                        ← container.spec.ts, test-container.spec.ts
├── fake/                             ← fake.spec.ts, realtime-fake.spec.ts
└── mail/
```

`import.ts` is the repo's longest — naming each port and implementation once is the deliverable.
**`fake/` and `test-container.ts` live in `src/`** so `tsc` checks them: a new `application` port is a
**compile error** in `test-container.ts` until it has a double. The barrel exports the harness, so they
reach `dist/index.js`, but ESM tree-shaking keeps them out of `apps/web`'s bundles.

## What it wires

| Field | Type it is exposed as | What it is today | Swapping it |
| --- | --- | --- | --- |
| `clock` | `Clock` | `SystemClock` | `FixedClock` in a test |
| `authorizer` | `Authorizer` | — | never; it is the kernel |
| `logger` | `Logger` | `JsonLogger` | `SilentLogger` in a test |
| `cache` | `CacheStore` | `RedisCacheStore` | one line |
| `storage` | `StorageGateway` | `S3StorageGateway` | one line |
| `queue` | `QueuePublisher` | `BullMqQueuePublisher` | one line |
| `vectors` | `VectorStore` | `PgVectorStore` | one line — pgvector → Qdrant |
| `assistantModel` | `AssistantModel`, behind `hasAssistant` | `OpenAiAssistantModel` (OpenAI, OpenRouter), `GeminiAssistantModel`, `CannedAssistantModel` | `ASSISTANT_PROVIDER`; `none` builds none |
| `searchMode` | `SearchMode` | lexical, or semantic over `OpenAiEmbeddingProvider` / `GeminiEmbeddingProvider` | `EMBEDDING_PROVIDER`; a new vendor is one `case` |
| `sessions` | `SessionResolver` | `BetterAuthSessionResolver` | one line |
| `activity` | `ActivityLogger` | `PgActivityLogger` | one line |
| `unitOfWork` | `UnitOfWork` | `PgUnitOfWork` | one line |
| `content` | `ContentSource` | `StaticContentSource` | one line — static → CMS |
| `auth` | `AuthInstance` | Better Auth | rewrite `auth.factory.ts`, and nothing else |
| `capabilities` | `CapabilityCache` | — | concrete on purpose; it *is* the caching decision |
| `principals` | `PrincipalBuilder` | — | concrete on purpose; four credential types, one shape |

`database`, `redis`, `queuePublisher` and `transactions` are **private**; consumers get `dispose()`, and
`apps/worker` builds its own `RedisConnection`. The four rules (abstract public types, no request state,
no `process.env`, reverse-order disposal) are in [container](reference/container.md); the test shape in
[test-container](reference/test-container.md). `src/mail/` is more than wiring — the only layer seeing
both translated copy and transport ([mail-pipeline](reference/mail-pipeline.md)).

## Config arrives, it is never read

`ContainerConfig` is every value in one shape; only each app's `env.ts` touches `process.env`, parsing
and handing it down (Biome's `noProcessEnv` keeps packages clean). So the whole system builds in a test
with a fake database and frozen clock, and the same code runs in web and worker.

## Every port has exactly one binding

`Container` binds every port `application` declares — no `undefined` fields; check the
[port list](../../application/docs/index.md) against `container.ts` name for name. `EventBus` was once
declared, faked and bound nowhere (publishing into nothing in production); it was deleted
([Simplicity](../../../docs/opinions/simplicity.md)), and the outbox later shipped whole —
`DomainEventPublisher`, `PgOutboxPublisher` and a `Container` line in one change.
