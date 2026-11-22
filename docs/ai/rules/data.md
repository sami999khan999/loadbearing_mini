---
title: Data and scale
description: Which store owns which data, what is derived, and what is non-negotiable in any new schema — in the lite kit, where the scale stores are not running but every seam is.
---

# Data and scale

> **Postgres owns anything a transaction depends on or a user reads right after writing.
> Everything else is a derived store behind a port.**

| Stream | Written by | Store in lite | Store at scale-up |
|---|---|---|---|
| Domain data | use-cases | Postgres | same |
| Audit trail | `ActivityLogger` | Postgres, partitioned, **in-transaction** | same |
| Domain events | `DomainEventPublisher` | Postgres outbox, partitioned, **in-transaction**, at-least-once, drained by the worker | same |
| Diagnostics | `JsonLogger` | stdout only | stdout → Loki |
| Analytics | — | **not built** | worker → Postgres snapshots → ClickHouse |
| Retired months | — | **not built**: partitions are kept, never dropped | archive-then-drop to S3 `cold/` |

**The test:** if dropping a store loses information not recoverable from Postgres or S3, it has
become a source of truth. Run it whenever a store is added, especially one that is "just a cache".

- **One Redis, two jobs, two names.** Caches are rebuildable; **BullMQ is not** (a lost job never
  happens). Sharing one instance is safe only under `maxmemory-policy noeviction`, so **every cache
  key carries a TTL**. Code reads `REDIS_CACHE_URL` or `REDIS_QUEUE_URL` by purpose, so splitting
  them is an `.env` change. An evicted session is a read-through, never a sign-out.
- **Nothing in lite drops a partition.** No retention pass exists, so only the tenant delete may
  remove a month or a tenant's rows. Retention arrives with its archive from
  [`docs/scale/`](../../scale/index.md), never as a bare `DROP`.
- **Every query is tenant-scoped.** A cross-tenant aggregate cannot be sharded; it waits for the
  analytics store rather than being written against Postgres.

**Every new schema:**
- `organization_id` on every domain table, as a branded `OrganizationId`.
- An index **leading with** every foreign key and filtered column (Postgres does not auto-index
  FKs, and a tenant-first composite cannot serve a cascade).
- **Every tenant-owned table `PARTITION BY LIST (organization_id)` in the migration that creates
  it**, and tables that grow with activity `PARTITION BY RANGE` underneath — converting later is a
  rewrite with downtime. Parents are the migration's; every child is `TenantPartitionSeed`'s.
- Query-count assertions in integration tests for anything that loops.
- **No tenant foreign key from a routed table to the catalog, and no foreign key into a
  tenant-partitioned table** — both hold on one node as on many. Between catalog siblings,
  `NO ACTION`, never `RESTRICT`. The audit trail names no actor by foreign key.

**Connections and placement:**
- **Write every connection as if pgBouncer sat in front in transaction mode.** Lite dials Postgres
  directly, which is the only reason a session-level `SET` would seem to work — **it is banned
  anyway.** Use `SET LOCAL` inside a transaction to raise a timeout; DDL a transaction cannot carry
  uses `DATABASE_DIRECT_URL`. Adding the pooler is then compose plus `.env`.
- **Every table is `catalog`, `local` or `routed`; the repository declares which.**
  `application/src/primitive/shard.ts` is the only list; `routed` is the default. A repository reads
  one placement (CI-asserted), and `BaseRepository.db` throws when a catalog repository is used in a
  routed transaction — **on lite's one node too**, so the call site shows up in a test run.
- **A cross-placement read runs before the transaction**, as two statements (routed ids, then
  catalog resolve), never a join.
- **A cross-tenant pass loops nodes, not tenants** (`Container.eachShard`, serially), even with one.

**Do not build in advance:** ClickHouse, Loki, a vector DB, a replica, a second shard node,
pgBouncer, a broker. **The seams are built; the stores are not running.** Each store comes back by
its page in [`docs/scale/`](../../scale/index.md).

Argument: [`docs/opinions/data-and-scale.md`](../../opinions/data-and-scale.md).
