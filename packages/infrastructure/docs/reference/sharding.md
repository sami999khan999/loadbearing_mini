---
title: Sharding
description: One key, one node, three placements — how a query finds its database, and the tripwire that makes a single-Postgres deployment reveal every use-case a split would break.
---

# Sharding

Not about running more Postgres — about being able to later without discovering then which use-cases
assumed one.

| Piece | Where | What it answers |
|---|---|---|
| `ShardingStrategy` | `composition/src/shard/` | what a request is placed *by* |
| `ShardResolver` | `pg/repository/pg-shard.resolver.ts` | which node that key lives on |
| `shard_assignments` | `pg/schema/shard.schema.ts` | the directory both read |
| `ShardScope` | `pg/transaction/shard-scope.ts` | which shard the ambient work belongs to |
| `DatabaseCluster` | `pg/primitive/database-cluster.ts` | the pool for a node |
| `TablePlacement` | `application/src/primitive/shard.ts` | which of the three a *table* is |

## The organization is the shard, and there is no number in between

Decision D28 removed the virtual shard. A key resolves straight to a physical node, so
`shard_assignments` is `(shard_key, node)` and nothing has to be told how many virtual buckets
exist or rebalanced when that changes.

The cost is that moving one tenant would be moving one tenant's rows, with no batching of a
thousand at a time. The benefit is that there is no second numbering scheme to keep in step, and the directory
is legible: one row per customer, naming a machine.

## `keyOf` runs once per request, and so does `resolve`

The strategy runs in the middleware after the principal is built, and the resolve runs there too.
Both results go into `ShardScope` together, as `{ key, node }`.

**That is what lets `BaseRepository.db` stay synchronous.** A resolver called per query would make
every repository method await a directory lookup before it could pick a pool; called once, the
node is already known and `this.db` is a property read. One `await` per request rather than one
per query, and the 183 call sites that read `this.db` never learned that sharding exists.

The cache is a read-through on `shard:key:<key>` with a **300-second** TTL —
`CapabilityCache`'s shape and deliberately not its sixty seconds. A capability changes when
somebody edits a role; a placement changes only when a tenant is moved, which lite has no job for,
and which carries an explicit `invalidate` when it happens.

## Three placements, and the tripwire between them

`TablePlacement.of` is the only list; each repository **declares** its placement (a guess is wrong once):

- **catalog** — what a principal is built from before a key is known, plus RBAC, the two
  tenant-less lookups, the archive index, the policy rows, flags, entitlement and doc grants.
Twenty-four tables.
- **local** — present on every node, written in whichever transaction is open: `activity_log`
  and `outbox_event`.
- **routed** — everything a tenant produces. It is the **default**, so a new slice's table needs
  no edit here, and an unplaced table routes rather than silently reading the catalog.

`BaseRepository.db` throws when its placement disagrees with the open transaction's (`local` fits both).
`tests/primitive/placement.spec.ts` asserts a keyless routed read or `run`, a catalog read in a routed
transaction, and a routed transaction nested in a catalog one all throw — and same-placement passes.
**It throws on one node** — harmless today, data corruption the day there are two, so found in tests,
not production. `PgUnitOfWork` likewise refuses a routed `run` nested in a catalog one.

## No read crosses a placement

The big kit had one: a recipient read that joined a routed table to catalog `users` and
`memberships`. It was split into two statements, then left with messaging — see
[notification recipients](notification-recipients.md). So `CROSS_PLACEMENT_KNOWN` in
`check-architecture` §22 is **empty**. An assertion with an exception set that is never emptied
records a rule rather than guarding one.

## A sweep is placed on a node, not on a tenant

Cross-tenant passes run in `ShardScope.atNode` (`key: null`) via `Container.eachShard` — **serially**
(parallel multiplies the pool by node count); a failing node logs `shard.sweep.failed`, the rest run, the
first error rethrows. There a `local` table resolves to the walked node; outside any scope, node 0. Which
passes loop: [the consumers](../../../../apps/worker/docs/reference/consumers.md).

### `catalogDb` is the one sanctioned crossing

`PgPartitionArchiveGateway` detaches on the walked node and records in catalog `partition_archive` through
`BaseRepository.catalogDb` — which throws unless `local` and returns the catalog pool, not the open
transaction.

It is deliberately the only one. A routed repository reaching the catalog is what the split
reader above avoided, and the guard makes that call a throw rather than a review comment.

## `PgShardResolver` is not a `BaseRepository`, and takes thunks

`DatabaseCluster.forKey` calls it, so it reads the catalog pool directly (routing would recurse). It takes
thunks (`() => Database`, `() => CacheStore`, `() => Logger`) because the cluster is built **with** it,
before pool and cache exist.

## A missing directory row is an error, not node 0

Every tenant gets a row from the founder, in the same transaction as its `organizations` row. So a key with no row is a tenant nobody placed — a bug in the founder, not a state to
recover from.

Guessing zero would work today and put a tenant's rows on the wrong machine the day it does not.
`shard.resolution.failed` is logged at `error` and the read throws.

## A tenant delete sweeps its own directory row

`shard_assignments.shard_key` is `text` with no foreign key, which is what lets a fork put a
region code in it — and it means nothing cascades. `PgTenantRepository.delete` therefore does two
statements: the directory row, then the organization. Without the first, the table grows with
tenant churn forever.

It is the same reasoning `partition_archive` follows and the opposite conclusion, because the two
have opposite lifetimes. A cold object outlives its tenant on purpose — thirty days of recovery
window, swept by the nightly pass. A directory row for a tenant that no longer exists answers a
question nobody can ask.

## The directory is read by id or slug

`PgShardMapReader.findByTerm` is the one read of the directory beside the resolver. The platform's
tenant lookups — plan, entitlement, flag target — take an organization id **or** a slug and use it
to find the tenant and its node.

It compares `organizations.id::text = $1`. Never `$1::uuid`: a slug cast to a uuid is a `22P02`
from the database rather than the empty answer a typed search should get.

The big kit also had a `/platform/shards` screen that counted tenants per node. It left with the
tenant move; see [Shard nodes](../../../../docs/scale/shard-nodes.md).

## The write freeze, kept for a move

Lite has no tenant move. It kept the part a move needs from every write path, so porting one back
needs no migration and no change to a repository — see
[Shard nodes](../../../../docs/scale/shard-nodes.md).

- **The freeze refuses, not queues:** a non-null `moving_to` makes `PgShardResolver` answer
  `frozen: true` and `PgUnitOfWork.run` throw `ForbiddenError("shard.move.inFlight")` for `routed`/`local`
  writes; reads continue, catalog writes pass. Nothing in lite sets `moving_to`.
- **So every routed write goes through `run`, even one statement** (`CR.11`) — `db` cannot tell reads from
  writes, and an *update* outside `run` would evade a move's count check.
- **A job re-reads its placement every transaction** (`24.2b`) via `withShard`'s `recheck`; frozen or moved
  throws and retries. Savepoints and catalog transactions skip it.
- **Catalog-transaction audit rows for a tenant off node 0 go through the outbox** (`24.2a`): catalog
  transactions run on node 0, so `PgActivityLogger` publishes `activity.recorded` there and
  `ActivityRelaySubscriber` writes it on the tenant's node (`on conflict do nothing`).

**A placement already in scope for the tenant is the answer, and the resolver is asked only without
one.** The founder depends on that. Its directory row is uncommitted when it writes
`organization.created`, and the resolver reads through its own pool. On two nodes every sign-up
failed with "No shard assignment" until the founder placed the audit on node 0 itself.

## What routing costs a request, measured

```bash
# a second Postgres, and DATABASE_SHARD_1_URL in .env naming it
ROUTED_SCALE=1000 pnpm smoke
```

`tests/smoke/routed.smoke.spec.ts`, averaged over a thousand resolutions against two nodes on one
developer machine, measured in the big kit:

| Path | Per call |
|---|---|
| **warm** — one cache read | 679 µs |
| **cold** — cache read, catalog query, cache write | 2 568 µs |
| a cache invalidate, for reference | 667 µs |

This machine's Redis round trip is ~0.67 ms (the one-`DEL` invalidate row shows it); faster Redis moves
both rows together. **The shape is the finding:** a routed request pays one cache read, never a query; a
miss is three round trips, once per key per five minutes. The serial `eachShard` walk read two nodes'
`count(*)` in 135 ms.

### Writes under load — `24.6`

`24.1` dropped the keys that made a routed insert on node 1 fail, so the write half runs now.
Eight tenants, four per node. Each write is the path a request takes: a placement read through the
real Redis cache, then a routed transaction inserting one notification. Each node's pool is 20, the
shipped `DATABASE_POOL_MAX`. 1× is four writers at once and 10× is forty, 1 000 writes each,
`ROUTED_SCALE=1000`:

| Level | Writers | Writes/s | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|---|
| 1× | 4 | 23 | 151 ms | 324 ms | 467 ms | 0 |
| 10× | 40 | 142 | 265 ms | 498 ms | 577 ms | 0 |

**Routing is not the time:** under 1 ms of 150; the rest is `fsync` (~100 ms on Docker Desktop/Windows).
10× writers bought 6× throughput (shared flushes), latency under 2×. **The test asserts correctness, not
numbers:** no failed write, every row on its tenant's node only. Provisioned-node numbers (`S.3`) are the
ones to plan with.

## Sharding by something else: four edits, and nothing else

A fork sharding by region or plan changes four places, and nothing else names the choice:

1. **`TenantKey`** in `application/src/primitive/partitioned-table.ts` (`"organization_id"`) — every
   table's `PARTITION BY LIST` column.
2. **The strategy** — `composition/src/shard/organization.strategy.ts`, body
   `Shard.keyOf(principal.organizationId)`.
3. **`TENANT_COLUMN`** in `check-architecture.mjs`, asserted equal to `TenantKey`.
4. **The worker's key derivation** — `apps/worker/src/bootstrap/with-shard.ts`.

`shard_key` stays opaque `text` (no migration for a region code); generator and seed read the alias.

## Read replicas

**The problem is staleness** — a replica replays late, so a write then a replica read can miss the row.
**`DatabaseCluster.readerAt` uses the replica only once caught up:** it reads the primary's
`pg_current_wal_lsn()` and the replica's `pg_last_wal_replay_lsn()`; caught up, the replica answers,
otherwise the primary. No caller reasons about lag. `replica.smoke.spec.ts` proves it on a live standby
(without the check, the first read misses).

| | cost |
|---|---|
| no replica configured, or the switch off | nothing — the same pool as before |
| a replica read | two round trips before the query, neither touching a table |
| a replica that is behind or down | those two, then the primary |

**Three things decide whether a read goes there.** A replica must be configured for the node:
`DATABASE_REPLICA_URL` for node 0, `DATABASE_SHARD_<n>_REPLICA_URL` for node n. The work must be
placed with `replica: true`. And the repository must ask for it, through `BaseRepository.reader()` rather
than `db`. Inside a transaction `reader()` is the transaction, because a transaction reads its own
writes.

**Today the public docs read there** (`doc.fn.ts` places them with `replica: true`;
`PgDocPageRepository.findPublished`/`search` and `PgDocSpaceRepository.list`/`findBySlug` use `reader()`);
no job passes the option. The status panel's lag is `now() - pg_last_xact_replay_timestamp()`, zero once
everything received is replayed (an idle primary sends nothing).

Unset, `DATABASE_REPLICA_URL` means every read goes to the primary. Lite's compose file starts no
standby; adding one is [Read replica](../../../../docs/scale/read-replica.md).

## Rehearsing the split

Lite's compose file starts one Postgres. Start a second one yourself, set `DATABASE_SHARD_1_URL`,
and `pnpm db migrate` applies the same schema to both. `tests/smoke/sharded.smoke.spec.ts` is what runs against it — gated on
`Stack.shard1`, provided by `vitest.smoke.config.ts`, because `check-architecture` §3 walks
`tests/` for `process.env` and that injection is the only door.

It creates two tenants, writes their directory rows naming node 0 and node 1, and asserts:

- each key resolves to the node its row names;
- `shard_assignments` exists on the catalog and **not** on shard 1;
- a notification written under a tenant placed on node 0 lands on node 0 and on no other node;
- a routed write under the tenant on node 1 lands on node 1, with no key reaching back to the
  catalog.

**That last one used to assert the opposite.** Ten foreign keys crossed from a shard to the
catalog, and a routed insert on node 1 failed with `23503` before it could land. Decision `24.1`
dropped all ten, so the case inverted — and it still fails on the old schema, which is the point
of keeping it.

It also creates a month partition on the node the runway is walking, and drains a tenant's event
from the outbox on the node it was written to.

## What is not built, and why it is not

**No placement policy.** Which node a *new* tenant lands on is a decision nobody has to make
while there is one node, and an interface with one implementation and no prospect of a second is
what [Simplicity](../../../../docs/opinions/simplicity.md) names as ceremony. It earns its place
at the split.

**No second node in the default stack.** `DATABASE_SHARD_<n>_URL` is read and the cluster indexes
what it finds, but `pnpm infra up` starts one Postgres. A second is a rehearsal rather than a
deployment — see above, and [Shard nodes](../../../../docs/scale/shard-nodes.md) for the real move.
