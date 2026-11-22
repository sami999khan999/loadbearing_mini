---
title: The consumers
description: Six consumers, each with a public handle() — the batch sizes and why they are what they are, and the failure each one exists to make visible.
---

# The consumers

| Consumer | Queue | Jobs | Registered |
|---|---|---|---|
| `MaintenanceConsumer` | `MAINTENANCE` | cleanup · partitions · retention · orphans · spares · doc-* · tenant-* | always |
| `EmbeddingConsumer` | `EMBEDDING` | index · reembed · doc-reindex | always |
| `MailConsumer` | `MAIL` | send | always |
| `OutboxConsumer` | `EVENT` | drain · deliver | always |
| `NotificationConsumer` | `NOTIFICATION` | digest-fanout · digest | always |
| `AssistantConsumer` | `ASSISTANT` | one answer per job | only with an `ASSISTANT_PROVIDER` |

## `handle()` is public on every one of them

It is the unit of work; `start()` is the BullMQ binding and needs live Redis — **a private handler is
one no test can reach.**

## `MaintenanceConsumer` is serial

Table locks — overlapping runs can deadlock a partition. The others take concurrency from [`env.md`](./env.md).

## `MaintenanceConsumer` exists because a schedule had no consumer

`CleanupSchedule` once published to a queue nobody consumed. An unknown job name **throws** — a rename on
one side must be loud.

| Constant | Value | Why |
|---|---|---|
| months of partition runway | 3 | A table with no current partition rejects **every** insert; three survives two missed runs |
| spare tenants | 20 | Pre-seeded tenants kept on node 0, so a sign-up between two top-ups does not pay for DDL |
| deleted-tenant days | 30 | How long a deleted tenant's archive stays in `cold/`. The delete is recoverable for that long |

**`partitions` only ensures the runway. Nothing in lite drops a month.** It walks every
month-partitioned table on the allowlist, on every node, a page of that node's tenants at a time.
Moving old months out to cold storage is [`docs/scale/retention.md`](../../../../docs/scale/retention.md).

**`MONTHS_PER_RUN` counts partitions, not runway, and the two differ by one.** Three is the current
month and the next two, so the job survives two consecutive missed runs and the third is a write
outage. The constant used to be called `MONTHS_AHEAD`, which read as three months of runway and was
never that — the log field is `months` for the same reason.

**The sweep takes expired invitations as well as sessions and verifications**, and that one is not
housekeeping: `invitations_email_uq` is on `(organization_id, email)`, so a lapsed row keeps that
address un-invitable until something removes it. Nobody would connect "re-invite says the address
already has an invitation" to a row that expired last month.

**`retention` does two things; only the second destroys.** It converges the bucket lifecycle to
`RetentionRules.lifecycleFor()` (`export/` at seven days), logging `retention.lifecycle.drifted` before
repairing a hand edit; then `sweepDeletedTenants` deletes `cold/` objects older than `DELETED_TENANT_DAYS`
([cold storage](../../../../packages/infrastructure/docs/reference/cold-storage.md)), logging
`cold.objects.swept` (`reason: "tenant_deleted"`) only when it removed something.

## `EmbeddingConsumer` catches nothing, on purpose

```ts
// Let it throw.
```

BullMQ's retry and backoff are driven by rejection, so catching and logging inside the handler turns
a retryable failure into **permanent, silent data loss**.

Failures are observed from the `failed` **event** instead, never from a `catch` inside the handler:
the listener does not swallow, so BullMQ still sees the rejection and still retries.

Everything worth testing lives in `IndexDocumentUseCase`, `ReembedChunksUseCase` for `reembed`, and
`ReindexDocsUseCase` for `doc-reindex`, which `pnpm ai:reindex --docs` queues to index every published
Docs page. All three are placed on the tenant's node with `withShard` first, because `document_chunks`
is routed.

## `MailConsumer` is the only thing in this system that sends

Every message is a job — retries, backoff and id dedupe — at one cost: **in development, mail arrives
only while the worker runs.** The provider cap is a worker `limiter` (`Env.mailRatePerMinute` per
minute), never a caller's sleep. **`mail.delivery.failed` fires from the `failed` listener on the last
attempt only** (`attemptsMade === opts.attempts`); the sent line carries the message id for provider
correlation ([mail pipeline](../../../../packages/composition/docs/reference/mail-pipeline.md)).

## `OutboxConsumer` runs two different jobs, and the split is the design

`drain` turns each unpublished event into one `deliver` job **per listening subscriber** — so a failure
is local, not a retry of every subscriber.

- **Job id `<subscriber>_<eventId>` dedupes** a crash between relay and mark; the window is a thousand
  deliveries or 24 hours (the drain's own `removeOnComplete: 10` once trimmed the shared set to ten; it is
  `true` now). Subscribers' idempotency on `event.id` is the guarantee.
- **Twelve attempts from five seconds** (~three hours) — the row is already published, so exhaustion needs
  `pnpm queue:replay event deliver` (kept a week). Others default to eight (~ten minutes).
- **`eachShard` continues past a failing node**, logging `shard.sweep.failed { node }` and rethrowing at
  the end.
- **Unlistened events are still marked published.**
- **Bounded drain** (100 × at most 20 batches) at `priority: 1`, deliveries at `priority: 10` — an
  unprioritised job sits on the plain wait list, which `moveToActive` empties first.
- **`outbox.drain.lagged`** at sixty seconds means "not running", not "busy".

## `NotificationConsumer` fans out one job per tenant, and never sends

`digest-fanout` publishes one `digest` job per tenant (so one failure stops nobody else); the digest
**enqueues** mail, never sends.

- **Job id `digest_<organizationId>_<day>` dedupes** double fires and redeliveries; the UTC day comes
  from `container.clock`.
- **The fan-out pages each node's catalog tenants** (500 at a time, one `addBulk` per page) — the old
  `SELECT DISTINCT` over `notifications` ran out of lock slots near 5 800 tenants. A tenant with nothing
  unread costs one pruned query.
- **A digest is four queries and one enqueue per 200 people** (candidates, addresses, modes, unread rows
  via a window function) over the half-open previous day; it places itself with `withShard`.

## Every cross-tenant pass loops the cluster, and the loop is over nodes

Passes without a tenant run in `container.eachShard`'s **node-only** scope `{ key: null, node }`:
`local` tables and routed reads resolve to that node, and `PgUnitOfWork` opens there; outside, node 0.

| Pass | What loops | What does not |
|---|---|---|
| `OutboxConsumer.drain` | the claim and the mark, per node | the fan-out: one Redis for the deployment |
| `OutboxConsumer.reportLag` | `oldestPendingAt`, per node | the line — one a run, from the **worst** node |
| `MaintenanceConsumer.partitions` | the runway, per node, over that node's tenants | the allowlist |
| `MaintenanceConsumer.orphans` | `orphanedTenants`, per node | the line — one per node that found any |
| `NotificationConsumer.fanOut` | the catalog's tenants, per node, a page at a time | the queue, and the per-tenant `digest` job |

All five are physical — a partition, an outbox row and a `SKIP LOCKED` claim all belong to one
database. The per-tenant jobs (`tenant-export`, `tenant-delete`, `digest`, the embedding jobs) do not
loop at all: each places itself on its tenant's node with `withShard`.

**The tenant page is narrowed by node, not filtered after the fact.**
`OrganizationReader.page(after, limit, onNode)` adds a correlated `EXISTS` over
`shard_assignments` — both catalog tables, so it stays one query. Without it, ensuring a runway
would read every tenant once per node and issue the DDL for tenants that are not there.

**`MaintenanceConsumer.cleanup` deliberately does not loop.** `sessions`, `verifications` and
`invitations` are catalog tables; sweeping them once per node would sweep the catalog N times.

**`PgPartitionArchiveGateway` spans two placements on purpose** — it detaches a deleted tenant's
partitions on its node and records them in catalog `partition_archive` via `BaseRepository.catalogDb`
(throws unless `local`). The object key carries no shard (a tenant lives on one node).

