---
title: The ports
description: One section per port whose reasoning outgrew a two-line comment — why three of them carry no Principal, and what each abstract method is refusing to offer.
---

# The ports

An abstract class the domain calls and `infrastructure` implements; this page carries the arguments the
port files leave out.

## Three ports carry no `Principal`, and that is the design

`MaintenanceGateway`, `PartitionArchiveGateway` and `OutboxGateway` take no actor on any method. That is not a hole in the authorization story.

Nothing they touch belongs to a tenant — **an expired session is expired for everybody; a partition is a
table's property** — so no organization could authorize it.

The guard is instead structural: nothing reachable from a request can call them. They are wired for
`apps/worker` and invoked only from a schedule.

### `MaintenanceGateway`

`sweepExpired` exists because `sessions` is bounded by expiry rather than partitioned — the trade
that table's own schema comment documents. This sweep is what makes that trade hold.

- `ensureMonthlyPartitions` runs months ahead — **a table with no current partition rejects every
  insert** — returning what it created; `ensureMonthlyPartitionsFor` does a page of tenants in one read
  and transaction; `monthlyPartitionsAfter` checks what *exists* (creating nothing is healthy or starved
  alike).

- **The table is a `PartitionedTableName`, not a `string`:** DDL takes no bind parameters, so the closed
  union from `PartitionedTable.ALL` is all that stands between interpolation and an arbitrary name.

**There is no method that drops a month.** Lite keeps every partition. The one drop is
`dropTenantPartitions`, the whole tenant level for one organization, which only a tenant delete
calls. `partitionsBefore` lists the months that delete archives first. Dropping months by age comes
back with its archive — see [`docs/scale/retention.md`](../../../../docs/scale/retention.md).

### `PartitionArchiveGateway`

Cold storage for a deleted tenant's rows, and the tenant export. Lite archives only on a delete,
so the delete is recoverable for as long as the sweep waits.

**Detach, upload, record, verify, drop, in that order** (dropping before verifying is loss), once per
tenant-month via `archive(table, period, organizationId)`; the period is ISO `YYYY-MM-DD`, part of
`partition_archive`'s key.

`markTenantDeleted` stamps the recovery window's tombstone; `sweepDeleted(before)` forgets older ones;
`sweep()` removes objects, then rows (a crash is re-runnable). The index has no foreign key, so nothing
cascades — cold storage closes its own GDPR hole.

`exportTenant` reads live rows and never detaches: an export must not take the tenant's data
offline while it runs. The long form is
[`infrastructure/docs/reference/cold-storage.md`](../../../infrastructure/docs/reference/cold-storage.md).

## `ActivityLogger` stamps its own time

No `occurredAt`, no tenant: the adapter stamps time from its `Clock` and reads the organization off
`actor` — **a caller passing a timestamp could backdate audit**. `action` is past tense:
`task.reactivated`.

## The two shard ports, and why there is no third

`ShardingStrategy.keyOf(principal)` decides **what** places a request (the fork's swap point);
`ShardResolver` decides **where** (every routed query, so cached). Both read `shard_assignments`, written
by the founder.

There is no `ShardPlacementPolicy`. Choosing which node a *new* tenant lands on is a decision
nobody has to make while there is one node, and an interface with one implementation and no
prospect of a second is the thing `docs/opinions/simplicity.md` names. It earns its place at the
split, not before.

`keyOf` runs **once per request** in the middleware and once per job in a consumer, never per
query. A strategy called per query is one that has to be fast; called once, it can read whatever
it needs.

`resolve` returns a physical node index (D28: the organization *is* the shard); `placementOf` adds the
freeze flag in one cache entry, read by `PgUnitOfWork.run` on every write. A key with no row is refused
(`shard.resolution.failed`) — guessing node 0 would be wrong the day after a split.

## `EmailSender` has exactly one method

No provider, no credentials, no from-address — those are adapter configuration, the same way a
bucket and a region are absent from `StorageGateway`.

**One method, because the system sends transactional messages and nothing else.** A campaign, a
template registry or a suppression list is a different product with a different port; adding them
here would make every adapter owe an implementation of features the domain never asks for.

Plain text is required and HTML is not. Every client renders text, a text part is what keeps a
message out of a spam folder, and a transactional email whose whole content is a link does not need
a layout to be readable.

`send()` resolves when the transport has **accepted** the message, which is not delivery and never
can be. A caller that needs delivery confirmation is asking a question only a webhook from the
provider can answer.

The `EmailReceipt`'s nullable `messageId` is **logged, not stored** (no delivery table), for later
correlation with the provider, and read optionally — reading it off an empty result once caused an
`UnavailableError` and a retry.

## `DomainEventPublisher` is broker-shaped before there is a broker

The four properties a broker cannot give back later ([Data and scale](../../../../docs/opinions/data-and-scale.md) §7):

- **`publish` returns nothing** — a return value is RPC.
- **Handlers are idempotent on a stable event id** — at-least-once.
- **No ordering.**
- **No handler exception reaches the publisher** — a broker cannot propagate one.

**Call it inside `unitOfWork.run`:** a broker publish in a transaction cannot roll back, and after commit
a crash loses it; the outbox row commits with the state.

The audit row and the outbox row sit side by side in the same `run`, and they are not the same thing:
**audit is the human fact, the outbox is the integration fact.** One has a reader in the UI; the other has a schema, a `published_at`, and subscribers.

## `OutboxGateway` hands out claimed work, and marks it only on success

`drain(limit, relay)` marks rows published **only if `relay` resolves** — a throw releases them for the
next tick (at-least-once; the fake honours the same order). **No transaction spans the relay:** the claim
is one auto-committed `UPDATE … FOR UPDATE SKIP LOCKED` stamping `claimed_until` sixty seconds out, so
replicas share the drain and Redis round trips hold no lock or snapshot (a held transaction once pinned
xmin and stalled vacuum node-wide). A dead drain's rows free when the lease passes; jobs dedupe by id.
`oldestPendingAt()` is `null` when healthy. **No inbox table** until **the first non-idempotent
subscriber**.

## `EventSubscriber` receives the event, never an actor

A subscriber builds a principal from `event.organizationId` — the actor's request-time permissions may
have changed, and the work is not on their behalf. Subscribers live **in their slice**
(`notification/notification.subscriber.ts`), run **only in the worker** (`OutboxConsumer` alone consults
`SubscriberRegistry`), and the registry rejects duplicate names or unknown events **at construction** — a
name is half of every job id, so a shared one silently skips a subscriber.

## `RealtimePublisher` is fire-and-forget, and says so

A frame published to a channel nobody is listening on is kept only as long as the adapter's
replay log keeps it — the last two hundred per channel, for an hour (`26.5`). A resume inside that
is replayed what it missed; one outside it is handed a `resync` and refetches what it subscribes
to. The `resync` variant stays in the contract because the log is short by design, and a contract
that promised a full replay would be a lie the first time a tab slept for a day.

Channels are **tenant-leading, always**: `org:<organizationId>:user:<userId>`. Sharded pub/sub
(`SPUBLISH`), Redis Streams and a broker partitioner can all key on a prefix, and none of them can
key on something buried in the middle. `RealtimeChannel` is a branded string so a channel cannot be
assembled by concatenation at a call site, which is how one ends up without its prefix.

A user channel is **authorised by construction** — you only receive your own.

## `RealtimeSubscriber` takes a signal because the domain has no `AbortSignal`

`subscribe(channels, signal)` ends on abort or max age, buffering nothing; a signal lets *something other
than the reader* end it (shutdown, age, a cap). Its type is `CancellationSignal` in `primitive/` — `lib`
is `["ES2024"]`, so no `AbortSignal` (DOM would import every browser global); a real one satisfies it
structurally. **The fakes are unconnected by default** (most specs ask only what was published); to
assert arrival, build one `InMemoryRealtimeHub` for both. Beware the name: `MemberRealtimeSubscriber` is
an `EventSubscriber`, not this port.

## `MailPublisher` returns nothing, and `MailRenderer` knows no transport

Callers hold `MailPublisher`, the worker `MailRenderer`; neither knows the other.

- **`publish` resolves `void`** — no delivery row to hand an id for. A `dedupeKey` deduplicates in the
  queue ([mail pipeline](../../../composition/docs/reference/mail-pipeline.md)).
- **The recipient's locale, not the request's** (`users.locale`; `Translator.with()` per recipient).
- **`priority` is `"high" | "normal"`** — the one distinction: is someone waiting.
- **`MailRenderer` returns both parts, always**, and is a port because the copy and routes live in
  `composition`.

## `SendMailUseCase` asserts nothing, and that is the design

The only use-case without `authorizer.assert`: mail has no tenant (auth mail, invitations to
non-users). Guarded structurally — only the mail consumer calls it. It enforces the **manifest**: key and
`unknown` params are checked before the transport, since an unbuildable message fails every retry.

## `StorageGateway`

No bucket, region or endpoint. Keys are `<subject>/<yyyy>/<mm>/<uuid>.<ext>` (lifecycle rules match
prefixes). `putStream` serves bodies too large to buffer (an archived partition can be tens of GB), with
the checksum computed in passing for later verification. Presigning is in the port because direct browser
upload is architecture: the use-case authorizes, then issues a time-limited URL.

## `SessionResolver` and why the session carries its tenant

`RequestHeaders` is declared (no `Headers` in `lib: ["ES2024"]`) and a Web `Headers` satisfies it. The
session carries its organization because `PrincipalBuilder` gets only headers and a `Principal` needs a
tenant — one column at sign-in, not a membership query per call; switching organizations is explicit.

## The small ones

| Port | The decision |
|---|---|
| `CacheStore.deletePrefix` | Invalidating a whole subject belongs here rather than at the call site: enumerating keys by hand pushes Redis semantics into the domain |
| `CacheStore.setIfAbsent` | Returns whether it wrote, which is what makes it an idempotency claim rather than a write. One `SET … EX … NX`, evaluated on the server, so two replicas racing a key cannot both be told they won it. Nothing in lite calls it; the big kit's message send dedupe did — see [`docs/scale/messaging.md`](../../../../docs/scale/messaging.md) |
| `EmbeddingProvider.embed` | Batched by construction — one round trip per call, never one per text. A single-string signature is the shape that turns a re-index into a thousand requests. The optional `purpose` says whether the text is a `document` or a `query`: Gemini embeds them differently, and OpenAI ignores it |
| `EmbeddingProvider.model` | Recorded on every chunk it embeds, so vectors from two models are never compared |
| `QueuePublisher` | The deduplication id is a domain rule ("enqueue OCR for this receipt, once"), not queue configuration |
| `UnitOfWork` | The implementation must genuinely enrol the repositories running inside `work()`; one that does not is worse than none |
| `VectorStore.search` | `goalIds` is required so the permission filter runs on the **input** set. Filtering results means the model already saw what the actor cannot. It takes a `model` too, and compares only chunks that model wrote |
| `VectorStore.searchText` | The same shape and scope rule, ranked by Postgres full-text search over the chunk text. What `EMBEDDING_PROVIDER=none` searches with, and it calls nobody |
| `ChunkFilter` | Required on `search` and `searchText`, so every caller names its corpus. `except` is the shared corpus less the guarded source types (`ChunkSource.GUARDED`, today `doc`), whose chunks carry their own read rule. `within` is one guarded type narrowed by a metadata key the indexer wrote — `DocSearch` passes the reader's visible spaces. An empty `values` matches nothing |
| `VectorStore.stale`, `saveEmbeddings` | The re-embed pass: chunks whose vector is missing or another model's, then new vectors for them with the text untouched. `ReembedChunksUseCase` is the caller |
