---
title: "@loadbearing/infrastructure"
description: Every concrete adapter the system owns, behind a port and confined to one package — Postgres and its schema, Redis, S3, BullMQ, SMTP and the embedding providers.
---

# `@loadbearing/infrastructure`

Owns `drizzle-orm`, `pg`, `ioredis`, `@aws-sdk/*` and `bullmq` so nothing else does; each class implements
an [`application`](../../application/docs/index.md) port and `Container` picks which to build. A grep for
those imports outside this package returns nothing.

**A separate database package used to sit beside this one, and was folded in.** The two were
siblings with no edge between them. Merging in this direction keeps the name honest: an S3 client in
a package called `db` would be a lie, but Postgres genuinely is infrastructure.

| | |
| --- | --- |
| **Package** | `@loadbearing/infrastructure` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/application` (the ports), `contracts`, `core`, `errors`, `permissions`, plus `drizzle-orm`, `pg`, `ioredis`, `bullmq`, `@aws-sdk/*` |
| **Used by** | `auth`, `composition`, `apps/worker` — **never** a browser bundle |
| **Environment** | server-only; `ServerOnly.assert()` is the runtime tripwire |

```
packages/infrastructure/
├── drizzle.config.ts                      ← build-time artefacts, above src/
├── migrate.ts                             ← the migration runner
├── seed.ts                                ← system roles, idempotent
├── partitions.ts, partition-ddl.ts        ← the partition runway by hand, and the DDL rewrite
├── platform-grant.ts, queue-replay.ts     ← the first platform admin, and failed jobs back on a queue
├── ai-reindex.ts                          ← queues a re-embed after a provider or model change
├── vitest.smoke.config.ts                 ← the wiring check, run against live containers
└── src/
    ├── index.ts
    ├── import.ts                          ← every external symbol, vendor SDKs included
    ├── pg/                                Postgres — the biggest tenant
    │   ├── primitive/   database.ts        → Database, DrizzleClient
    │   │                base.repository.ts → BaseRepository
    │   ├── schema/      *.schema.ts       ← drizzle tables + the barrel drizzle-kit reads
    │   ├── repository/  pg-*.ts           → every adapter, one file each, flat
    │   ├── transaction/ pg-unit-of-work.ts → PgUnitOfWork, TransactionScope
    │   └── seed/        system-role.seed.ts → SystemRoleSeed
    ├── redis/     redis.connection.ts      → RedisConnection, RedisConfig
    │              redis-cache.store.ts     → RedisCacheStore
    │              redis-realtime.*.ts      → RedisRealtimePublisher, RedisRealtimeSubscriber
    ├── s3/        s3-storage.gateway.ts    → S3StorageGateway, S3Config
    │              s3-storage-policy.gateway.ts → S3StoragePolicyGateway
    │              storage-key.ts           → StorageKey
    ├── bullmq/    bullmq-queue.publisher.ts → BullMqQueuePublisher
    ├── smtp/      smtp-email.sender.ts     → SmtpEmailSender
    ├── web-push/  web-push.sender.ts       → WebPushSender
    ├── unified/   unified-markdown.renderer.ts → UnifiedMarkdownRenderer
    ├── canned/    canned-assistant.model.ts → CannedAssistantModel
    ├── gemini/    gemini-embedding.provider.ts → GeminiEmbeddingProvider
    │              gemini-assistant.model.ts → GeminiAssistantModel
    ├── sse/       server-sent-event.reader.ts → ServerSentEventReader
    │              server-sent-event.request.ts → ServerSentEventRequest
    │              stream-watch.ts          → StreamWatch
    └── openai/    openai-embedding.provider.ts → OpenAiEmbeddingProvider
                   openai-assistant.model.ts → OpenAiAssistantModel
```

**The runnable scripts sit above `src/`.** A script inside a folder makes that folder's barrel
execute it on import — the failure that moved `seed.ts` out when `PgPersonalOrganizationEnroller`
needed `SystemRoleSeed`. `src/pg/seed/` keeps the class; `seed.ts` is the thing you run.

**One folder per external system**, so `ls src/` lists the dependencies, and filenames lead with the
technology ([Files](../../../docs/opinions/files.md)).

**The external system is the subject, and it is the only subject.** `pg/repository/` used to be five
folders — `activity/`, `analytics/`, `rbac/`, `vector/`, `maintenance/` — each holding one or two
files. They were flattened for two reasons.

One-file folders are paths ([Simplicity](../../../docs/opinions/simplicity.md)), and two implementations
of one port should read as `openai-…` beside `gemini-…` — **technology is the axis**.

`tests/smoke/` is the only folder that is not a system: it spans every store at once. And
`pg/schema/` is the one place the subject rule bends — drizzle-kit needs a single barrel naming every
table, so the tables sit together rather than beside the repositories that read them.

**A folder here means the seam is implemented, not that it is used.** `openai/` and `gemini/` are
built only when `EMBEDDING_PROVIDER` names them — see [Embedding](reference/embedding.md).

## What belongs here and what only looks like it does

| Store | Adapter here? | Why |
| --- | --- | --- |
| Redis | **yes** | `CacheStore`, and the connection BullMQ needs |
| S3 / MinIO | **yes** | `StorageGateway` |
| BullMQ | **yes** | `QueuePublisher`. Consumers live in `apps/worker` |
| OpenAI, Gemini | **yes** | `EmbeddingProvider`, one per service |
| SMTP | **yes** | `EmailSender` |
| Postgres | **yes** | `drizzle-orm` + `pg` behind most of the ports, plus the schema and migrations |
| A log platform | **nowhere** | Logs are JSON on stdout. No client, no port, nothing to import |

`JsonLogger` writes stdout and has never heard of a log store, so adding one is config
([Logs](../../../docs/scale/logs.md); analytics: [Analytics](../../../docs/scale/analytics.md)).

## The swap points, and what makes them real

Two ports have more than one implementation, or are shaped to take one. Each is chosen by a field on
`ContainerConfig` rather than by a `new` in the constructor — so adopting a store is an environment
variable and one `case`, never a change to a use-case, a repository, or a test.

| Port | Chosen by | Today | Next | Trigger |
| --- | --- | --- | --- | --- |
| `VectorStore` | `VECTOR_DRIVER` | `pgvector` | a dedicated vector database | pgvector recall or latency degrades |
| `EmbeddingProvider` | `EMBEDDING_PROVIDER` | `none`, `openai` or `gemini` | another provider | cost or quality |

There was a third. `AnalyticsReader` had a `postgres` and a `clickhouse` implementation behind
`ANALYTICS_DRIVER`, and **nothing ever read through either** — so the port, both adapters and the
flag were deleted rather than kept warm. See [Simplicity](../../../docs/opinions/simplicity.md).

**A discriminated `driver` makes "swap it" real** — `buildVectorStore`'s exhaustive `switch` fails the
build on an unhandled one. **The vector swap is cheap because `search()` and `searchText()` take the
resolved goal scope** — a remote store cannot join back to permissions.

## One Redis, two roles, one class

A URL and client per role — a correctness boundary. Lite points `REDIS_CACHE_URL` and `REDIS_QUEUE_URL`
at one `noeviction` instance (full means refused writes, not dropped jobs); splitting is config
([Split Redis](../../../docs/scale/split-redis.md)).

| | `client()` | `queueClient()` |
| --- | --- | --- |
| URL | `REDIS_CACHE_URL` | `REDIS_QUEUE_URL` |
| Key prefix | `keyPrefix`, `app:` by default | **none** — BullMQ manages its own keys |
| `maxRetriesPerRequest` | default | **`null`**, or blocking commands die |
| Losing a key | a slow minute | **work that never happens** |

`realtimeClient()` and `subscriberClient()` are the other two roles. Both ride the cache URL unless
`REDIS_REALTIME_URL` names another — see [Realtime](reference/realtime.md).

**Which connection a consumer gets is a property of what it is doing**, not a wiring decision. Passing
two bare `Redis` instances into `Container` puts that choice at a call site where both arguments have
the same type and swapping them compiles.

`maxRetriesPerRequest: null` is not optional. BullMQ's blocking commands sit open indefinitely and
ioredis's default retry limit kills them — the symptom is workers that stop consuming after a few
minutes, with no error.

**One memoised client per role**; `healthy(role)` pings the one in use, not a fresh socket.

`healthy` takes the role rather than handing out a `Redis`, which is what lets
[`Container.healthy()`](../../composition/docs/reference/container.md) check every role without
`ioredis` ever appearing in `packages/composition`.

## The `keyPrefix` asymmetry, in both directions

ioredis prefixes key arguments but **not** `SCAN`, so `deletePrefix` handles both directions:

```ts
const keyPrefix = this.redis.options.keyPrefix ?? "";
const pattern = `${keyPrefix}${prefix}*`;                       // MATCH needs it added
...
await this.redis.unlink(...keys.map((k) => k.slice(keyPrefix.length)));   // and stripped back off
```

**Missing the strip is silent** — double-prefixed `UNLINK` deletes nothing without error, so the smoke
check reads back after pruning. `deletePrefix` is capability invalidation: a broken prune keeps revoked
permissions.

## Other decisions worth knowing

- **A corrupt cache entry is a logged miss** (`cache.entry.corrupt`), not a throw — post-deploy DTO
  changes become latency, not an outage, and stay visible.
- **`SCAN` + `UNLINK`, never `KEYS` + `DEL`** — `KEYS` blocks the server.
- **Storage keys hold no filename** (`<subject>/<yyyy>/<mm>/<uuid>.<ext>`) — traversal, unicode and length
  in one; the display name lives in the row.
- **`removeOnComplete`/`removeOnFail` are mandatory** — forever-kept jobs fill a `noeviction` instance.
  So recovery reconciles against Postgres, making handler idempotency a requirement.

## The smoke check

```bash
pnpm --filter @loadbearing/infrastructure run smoke
```

`tests/smoke/` runs against live containers (a fake tests the fake): cache round trip and prune, rate
limit, realtime deliver and replay, S3 with checksum, job publish and dedupe; `pooled.smoke.spec.ts` checks
what a pooler could break (statement timeout, savepoints, advisory locks, outbox claim). Optional parts
gate their own files — `DATABASE_SHARD_1_URL`, `DATABASE_REPLICA_URL`, `TENANT_CEILING`, `FAN_OUT_SCALE`,
`ROUTED_SCALE` — and skip with a line. `vitest.smoke.config.ts` reads the root `.env` explicitly (a pnpm
filter's cwd finds nothing) and throws on a missing name.

## Reference

- [`PgUnitOfWork`](reference/unit-of-work.md) — the transaction scope, and what enrolling a
  repository in one actually means.
- [Enrollers, the founder, and the claimer](reference/enrollers.md) — the advisory locks, the races
  they protect against, and why every one of them binds structurally.
- [Embedding](reference/embedding.md) — `none`, `openai` or `gemini`, lexical search, and what a provider switch does to the corpus
- [Assistant models](reference/assistant.md) — OpenAI, OpenRouter, Gemini and the canned fake behind
  `AssistantModel`: the stream, the two timeouts, and what a failure is
- [pgvector](reference/pgvector.md) — the permission filter on the input set, the score floor, and
  the `ORDER BY` that stops the index being used.
- [Partitions](reference/partitions.md) — the allowlist as the whole policy, the two mechanics that
  are not optional, and which reads prune to one month and which read every one.
- [Sharding](reference/sharding.md) — one key, one node, three placements; why `this.db` stays
  synchronous, and the tripwire that makes one Postgres reveal what a split would break.
- [Notification recipients](reference/notification-recipients.md) — four audiences, the
  correlated `EXISTS` that keeps one a single statement, and the one read that is two on purpose.
- [Cold storage](reference/cold-storage.md) — the tenant export, the 30-day `cold/` archive of a
  deleted tenant, and the sweep that removes it.
- [The bucket's lifecycle policy](reference/storage-policy.md) — why a second gateway, why "no
  configuration" is an error code, and why the app owns the whole configuration rather than a rule.
- [Realtime](reference/realtime.md) — one subscriber connection per process, ref-counted channels,
  and why the overflow is a `resync`.
- [Fan-out](reference/fan-out.md) — the three §6 paths measured against the running stack, why the
  realtime publish was the one to worry about, and what a `users` delete does to a partitioned
  table.
- [The doc renderer](reference/doc-renderer.md) — the unified pipeline and why the sanitiser sits
  where it does, what it lets through, and the type stub that keeps the DOM out of this package.
