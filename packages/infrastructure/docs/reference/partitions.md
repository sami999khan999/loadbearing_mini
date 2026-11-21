---
title: Partitions
description: Tenant first and month underneath, the allowlist as the whole policy, and pruning measured rather than assumed — what a partitioned table costs and what it buys.
---

# Partitions

**Every tenant-owned table is a tenant partition first.** Eight of them take
`PARTITION BY LIST ("organization_id")`, and the three that also grow with time take
`PARTITION BY RANGE` again underneath, one child per month:

```
notifications                         ← the parent, LIST (organization_id)
└── notifications_<32hex>             ← one tenant,  RANGE (created_at)
    ├── notifications_<32hex>_2026_09
    └── notifications_<32hex>_2026_10
```

`outbox_event` is month-only: the once-a-second drain must not touch a partition per tenant. The month
level follows [`data.md`](../../../../docs/ai/rules/data.md)'s test (a table gaining twelve rows a year
gains nothing from it); the tenant level makes a tenant's read prune to one subtree, its data a
`drop table`, and a physical split a data move.

## The allowlist is the policy

`PartitionedTable.ALL`, in `packages/application/src/primitive/partitioned-table.ts`, is a frozen
list of `{ name, tenantKey, column, retentionMonths }`. It is the whole policy for every partitioned
table, in one place:

| Table | `tenantKey` | `column` | `retentionMonths` |
| --- | --- | --- | --- |
| `activity_log` | `organization_id` | `occurred_at` | 13 |
| `outbox_event` | — | `occurred_at` | 2 |
| `notifications` | `organization_id` | `created_at` | 12 |
| `notification_preferences` | `organization_id` | — | — |
| `document_chunks` | `organization_id` | — | — |
| `doc_spaces` | `organization_id` | — | — |
| `doc_pages` | `organization_id` | — | — |
| `doc_revision` | `organization_id` | `created_at` | `null` — an archive path, not a policy |
| `doc_sections` | `organization_id` | — | — |

`tenantKey: null` = not split by tenant; `column: null` = tenant level only; `retentionMonths: null` =
never retired. **Nothing in lite reads `retentionMonths`** — lite drops no month; the field is the big
kit's archive-and-prune policy, kept so the lists match ([Retention](../../../../docs/scale/retention.md)).

**Nothing reads a copy of this list** — `TenantPartitionSeed`, `MaintenanceConsumer.partitions()` and the
`PartitionedTableName` union all derive from it, so a new table is one entry (a fork sharding by store or
region edits `TenantKey` and its schema). §21 checks it against `migrations/*.sql` both ways: an unlisted
partitioned table gets no partition for a new tenant (a failed first insert), an unpartitioned entry
breaks every `ATTACH`.

## The parents are a migration; the children are a seed

Migrations create **parents only**; every child (tenant partition and runway months) comes from
`TenantPartitionSeed` — in the founding transaction, and run by `migrate.ts` for every organization after
a migration. A SQL copy would drift.

**Created standalone, then attached**, never `create table … partition of` (`ACCESS EXCLUSIVE` on the
parent for the transaction, stalling every read for a signup). `ATTACH PARTITION` takes
`SHARE UPDATE EXCLUSIVE` and an empty child needs no scan — **unless a foreign key points into another
partitioned table** (below). Names are `<table>_<32hex>[_<yyyy>_<mm>]`, the uuid validated against
`^[0-9a-f]{32}$` before `sql.raw`; the longest, `notification_preferences_<32>`, is 57 of 63 characters.

## No foreign key points into a tenant-partitioned table

**`PF.1` dropped the last two** in the big kit; `tests/maintenance/tenant-partition.spec.ts` keeps them
out. Measured costs:

- **Every signup's attach validated them** — over 100 ms each at 500 tenants, under 10 ms without.
- **Validation took `SHARE ROW EXCLUSIVE` on the referenced table**, blocking its writes per attach.
- **Drops had to detach first** — 60 of 142 s dropping 1 658 tenants.

A new table wanting such a key checks the reference in code; the nightly `orphans` job counts tenants
with partitions and no organization row.

## Dropping a tenant: one statement per table, and never `CASCADE`

`TenantPartitionSeed.drop`, called by `dropTenantPartitions`:

- **No transaction** — each `drop table` commits alone, so `ACCESS EXCLUSIVE` lasts one statement (in one
  transaction a single reader held every parent; the spec proves it).
- **Fifty names per statement** — 11 611 partitions in 1 m 42 s, versus two tenants a minute (`4f45294`).
- **One `pg_class` probe** for all names; a gone tenant is `[]`, so retries finish.
- **Never `CASCADE`** — month children go anyway, and a cascade from one partition would drop a key from
  the parent for every tenant with only a `NOTICE`.

It walks the allowlist backwards, keeping order right if a sibling key returns.

## Two mechanics that are not optional

**Every partition key is in the primary key** (Postgres requires it of every unique constraint):
`(id, organization_id, created_at)` or `(id, organization_id)`; `Uuid.v7()` keeps it time-ordered.
`notifications_dedupe_uq` carries `created_at` too — sound **only** because it is the *event's* timestamp,
so a redelivery collides; a `defaultNow()` column would make a unique index that never fires.

**Drizzle cannot express `PARTITION BY`** (nor do its snapshots), so §21 reads migration text; tables are
ordinary `pgTable`s and the clause is appended to the generated DDL.

## Adding a partitioned table is three steps

1. **The schema**, with a composite primary key: `primaryKey({ columns })` naming every partition
   key. Drizzle emits the composite form only when the schema declares it.
2. **One allowlist line** in `PartitionedTable.ALL`, listed ahead of any table that references it.
3. **`pnpm db:generate`.**

That is `drizzle-kit generate && tsx partition-ddl.ts`: the second opens only the journal's newest
migration (never an applied one — the migrator hashes whole files) and appends
`PARTITION BY LIST ("<tenantKey>")` (or `RANGE ("<column>")` without a tenant level) to each listed
`CREATE TABLE`; no children, idempotent. **It refuses rather than guesses:** a primary key missing a
partition key ("declare the composite primary key in the schema"), or a table an earlier migration made
unpartitioned (convert by hand). A refusal leaves drizzle-kit's file; fix the schema and regenerate.

**No `DEFAULT` partition, ever** — it turns a missing month into misplaced rows and makes that month's
`ATTACH` scan it. §21 fails on one.

## The runway, and what bounds tenants per node

`MaintenanceConsumer.partitions()` ensures three months per table per tenant (current plus two), so
two missed runs survive and a third is an outage. It reads the runway *before* ensuring and emits
`partition.runway.low` under two months (read after, it never fires).

**One read and one transaction per 200 tenants** (`ensureMonthlyPartitionsFor`, `PF.5`): take the
table's advisory lock **first** (else two booting replicas race to `42P07`), read all children in one
`pg_inherits` query, create only the missing months — versus 48 000 statements at 2 000 tenants per
tenant before.

## What a node carrying tenants actually costs

`tests/smoke/tenant-ceiling.smoke.spec.ts`, synthetic tenants via `TenantPartitionSeed`. **Postgres 17,
2026-09-24, in the big kit**, a busy developer machine — distrust any move under 2×. The big kit had
sixteen partitions per tenant; lite has seventeen (eight tenant-level plus three months × three tables) —
rerun with `TENANT_CEILING` before trusting these. **Before → after `PF.1`–`PF.5`:**

| tenants | signup DDL | drop one tenant | runway pass | plan |
| --- | --- | --- | --- | --- |
| 100 | 378 → 111 ms | 706 → 43 ms | 3.2 s → 70 ms | 0.58 → 0.30 ms |
| 500 | 645 → 150 ms | 228 → 88 ms | 11.6 s → 0.27 s | 0.67 → 0.36 ms |
| 2 000 | 354 → 377 ms | 127 → 42 ms | 35.6 s → 1.6 s | 0.31 → 0.21 ms |

Signup DDL is one tenant's probe, create and attach (`pg_stat_statements`, twenty signups); the first
2 000 row ran after the keys were gone.

- **Planning time is flat** (0.2–0.7 ms at every count) — the point of the tenant level. It replaces
  `D29`'s "a few hundred tenants per node".
- **A tenant-level attach grows** (~3 ms at 100, ~27 ms at 2 000) — hence `PF.3`'s **warm spares**
  ([enrollers](enrollers.md)).
- **The runway is ~0.8 ms per tenant per table** — 1.6 s at 2 000.
- **Judge `24.7`'s pooled partition on relation count** — attach time and lock arithmetic grow.

## The lock table bounds an unpruned read

`max_locks_per_transaction` 1 024 × `max_connections` 200 = **204 800** shared lock slots. An unpruned
statement locks every leaf and tenant partition with all indexes (`pg_locks` after one root
`select count(*)`):

| table | indexes | locks per tenant | at full retention | one such read fails at |
| --- | --- | --- | --- | --- |
| `notifications` | 6 | (months + 1) × 7 | 12 hot + runway ≈ 15 months → 112 | **~1 800 tenants** |
| `activity_log` | 3 | (months + 1) × 4 | 13 + runway ≈ 16 months → 68 | ~3 000 tenants |

Those counts assume the big kit's retention; lite drops no month, so the ceiling falls every month
([Retention](../../../../docs/scale/retention.md)). The digest's tenantless `SELECT DISTINCT` is gone
(`CR.22`); the orphan check reads partition names. Every repository query carries the tenant, and `pg`
sends unnamed statements, pruned at plan time. What still would:

- **A hand-typed query or browsing tool** on a root — `53200`, for every backend needing a lock.
- **A named prepared statement on a partitioned parent** — generic plans lock everything. Never allowed.

The setting stays 1 024; past ~1 800 tenants raise it or add a node
([Shard nodes](../../../../docs/scale/shard-nodes.md)).

**`pnpm db:partitions` is the same routine from a shell**, for the operator whose worker was down on
the first of the month. It prints a row per table per tenant:

```
┌─────────┬─────────────────┬──────────────────────────────────────┬─────────┬───────┐
│ (index) │ table           │ tenant                               │ created │ ahead │
├─────────┼─────────────────┼──────────────────────────────────────┼─────────┼───────┤
│ 2       │ 'notifications' │ '01a0b342-18da-7337-83c9-a39020f26f78' │ 2     │ 0     │
└─────────┴─────────────────┴──────────────────────────────────────┴─────────┴───────┘
1 of 4 had under two months of runway.
```

**`ahead` is before the run** — a zero means month end would have failed; `created` is the fix.

## Pruning is measured, not assumed

`tests/pg/partition-pruning.spec.ts` captures each repository statement drizzle actually issued
(`DatabaseConfig.logger`) and plans it with `EXPLAIN (FORMAT JSON)` and real parameters. **Which assertion
holds is the finding:**

| Assertion | Queries | What it protects |
| --- | --- | --- |
| **One tenant partition** | every tenant-scoped read | The tenant predicate — the neighbour's subtree is not in the plan |
| **Exactly one month** | `markRead` | An equality or a closed range on the time column |
| **The retention tail is pruned** | `listUnreadBetween` | A floor — nothing older than it is in the plan |
| **Bounded by the cursor's month** | the inbox's later pages | A ceiling — nothing newer than the cursor is in the plan, and the cursor is still an index condition |
| **Pinned at every month of the tenant** | the inbox's first page, `countUnread`, `unreadSubjectHolders`, `markAllRead`, the outbox drain | Today's behaviour, deliberately |

The first row is proven against a second tenant with rows in both months (else it passes vacuously).

- **A row-constructor cursor does not prune** — `(created_at, id) < (at, id)` showed `Subplans Removed: 0`
  — so since `PF.6` later pages add a redundant `created_at <= at`, **beside it, never instead**: the
  expanded `OR` form prunes but demotes the cursor from `Index Cond` to `Filter`. The spec asserts the
  row constructor stays an `Index Cond`.
- **A floor cannot prune future months**: `created_at >= x` scans four of fifteen. "Exactly one" needs
  floor *and* ceiling.
- **The last row is a change detector** — a bound added later fails it and is lowered deliberately.

Unbounded reads cost 0.21–0.87 ms at the big kit's steady state. **Lite has none** (no month dropped), so
they slow each month — re-measure the pinned row first.

## Converting a table that already holds rows

Postgres has no `ALTER TABLE … PARTITION BY`: create a partitioned parent, copy, swap under a lock.
`0000_lite_baseline.sql` partitions every table from the start; only a later table with rows needs it.
