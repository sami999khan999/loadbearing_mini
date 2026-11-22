---
title: "@loadbearing/application"
description: Principal, Authorizer, and the abstract ports. Zero framework imports and no third-party runtime dependency — the package that makes every infrastructure decision reversible.
---

# `@loadbearing/application`

A use-case inside a server function makes a transport swap a business-logic rewrite; here, the transport
is an adapter. `grep -rE "@orpc|@tanstack|@nestjs|drizzle|ioredis|aws-sdk|better-auth"
packages/application/src` returns nothing (§1).

| | |
| --- | --- |
| **Package** | `@loadbearing/application` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/contracts`, `@loadbearing/content` (**the `Locale` type only**), `@loadbearing/core` (`ServerOnly`), `@loadbearing/errors` (`ForbiddenError`), `@loadbearing/permissions` — no third-party runtime dependency, ever |
| **Used by** | `infrastructure`, `auth`, `composition`, `apps/worker` — **never** a browser bundle |
| **Environment** | server-only; `ServerOnly.assert()` is the runtime tripwire |
| **Build** | `tsup` → `dist/index.js` + `dist/index.d.ts` |

```
packages/application/
├── src/
│   ├── index.ts
│   ├── import.ts                 ← ServerOnly, ForbiddenError, ids, CapabilitySet
│   ├── primitive/                → Principal, Authorizer, QueueName, PartitionedTable, …
│   ├── port/                     ← 31 cross-cutting ports; abstract classes only, zero implementations
│   └── <slice>/                  ← ai, apikey, assistant, doc, flag, mail, member, messaging, notification, platform, rbac, subscriber
│                                   each: its use-cases and its own repository ports
└── tests/                        ← mirrors src/
```

## This package does not log

A use-case records through `ActivityLogger` or throws a typed error — no `observability` import (§2). An
audit row **must not** be lost (in-transaction); a diagnostic **may** (stdout)
([Data and scale](../../../docs/opinions/data-and-scale.md)). So no third `execute` argument, no ambient
context, and a `ForbiddenError` logged **once**, where caught.

## The ports

The main ones of `port/`'s 31. Each is an **abstract class**, not an interface — real at runtime, so `extends`
chains a prototype and `noImplicitOverride` catches a rename.

| Port | Implemented by | Swap target |
| --- | --- | --- |
| `ActivityLogger` | `PgActivityLogger` | never; audit is Postgres at every scale |
| `PartitionArchiveGateway` | `PgPartitionArchiveGateway` | never — it *is* the Postgres side |
| `CacheStore` | `RedisCacheStore` | managed Redis |
| `CapabilityInvalidator` | `CapabilityCache` — `auth` | any cache the resolver reads |
| `EmailSender` | `SmtpEmailSender` | any provider that speaks SMTP |
| `EmbeddingProvider` | `OpenAiEmbeddingProvider`, `GeminiEmbeddingProvider`, or none | any embedding API |
| `MailPublisher` | `QueuedMailPublisher` — `composition` | never; the queue is the pipeline |
| `MailRenderer` | `ContentMailRenderer` — `composition` | a template engine, if one earns it |
| `MaintenanceGateway` | `PgMaintenanceGateway` | never |
| `QueuePublisher` | `BullMqQueuePublisher` | managed Redis |
| `SessionResolver` | Better Auth — `auth` | any session library |
| `StorageGateway` | `S3StorageGateway` | S3, R2 |
| `UnitOfWork` | `PgUnitOfWork` | never |
| `VectorStore` | `PgVectorStore` | a dedicated vector database |

Unattributed implementations are in `infrastructure`; each port has exactly one `container.ts` binding.
**Repository ports live with their slice** (`src/member/member.repository.ts`) — one glob per slice, honest
`CODEOWNERS`. `VectorStore` is cross-cutting: a new feature adds a *method*, not a *file*.

### Diagnostics have no port

`JsonLogger` writes JSON to stdout, and a collector can tail it. The write path has no port because
it has no dependency. Nothing here reads logs back. The big kit's log reader is in
[`docs/scale/logs.md`](../../../docs/scale/logs.md).

## One port carries a required permitted scope

`VectorStore.search()` and `searchText()` require `goalIds` — the security design:

```ts
const goalIds = actor.capabilities.goalsWith("ai.embedding.read", input.goalIds ?? []);
const hits = await this.vectors.search(actor.organizationId, embedding, provider.model, goalIds, limit);
```

Post-retrieval filtering means the model already saw what the actor cannot; in the signature, the scope
cannot be forgotten.

A remote store (Qdrant) cannot join back to goal membership, so an unpassed scope does not exist.
`search()` also takes the provider's `model` and compares only its chunks; `ReembedChunksUseCase` rewrites
stale ones via `stale()` and `saveEmbeddings()`.

## A flag is asked before a permission

`FlagCache.assertOn(actor, key)` is meant to run first, and only then a key asserted. The order is
the point: a feature this organization does not have yet is not a feature the caller lacks a right
to, so it answers `NOT_FOUND` rather than `FORBIDDEN`. The error carries no flag name, because
`toJSON()` reaches the browser.

Lite declares no flags, so nothing calls it yet. The big kit's widget flags are in
[`docs/scale/widgets.md`](../../../docs/scale/widgets.md).

## Reference

- [Authorizer](reference/authorizer.md) — the gate, the load-assert-work shape, and the one leak it accepts
- [The ports](reference/ports.md) — one section per port whose reasoning outgrew a two-line comment:
  the ones that carry no `Principal`, and what each method refuses to offer

- [The platform slice](reference/platform.md) — what a use-case above the tenant may assume, why
  its health seam is a slice port, and the audit rebase that keeps a global change out of a
  customer's trail

- [Messaging](reference/messaging.md) — the direct key, unread computed rather than
  counted, and where the send dedupe went when `messages` took a month level.

- [Docs](reference/doc.md) — why the platform's docs are the platform organization's rows, a
  page rendered once and read from one row, and who may read a public or granted space.
- [Assistant](reference/assistant.md) — the asker rebuilt in the worker, retrieval that searches
  as them, one log per answer, settling once, and what reaches the provider.
