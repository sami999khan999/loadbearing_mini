---
title: Data and scale
description: Which store owns which data, what is derived, what to build now, and the order every scaling move happens in.
---

# Data and scale

> [!NOTE]
> **Lite kit.** This is the big kit's argument, kept whole because lite is the same design earlier
> on it. Lite builds all of §4 *Build now* and runs none of the stores §5 and §8 add: no Loki, no
> ClickHouse, no cold tier or retention pass, no pgBouncer, no replica, one shard node, and one Redis
> behind both `REDIS_*_URL` names. Where this page says a store *is* running, read it as the target;
> [`docs/ai/rules/data.md`](../ai/rules/data.md) states what holds today and
> [`docs/scale/`](../scale/index.md) brings each store back.

> **Postgres owns anything a transaction depends on or a user reads immediately after writing.
> Everything else is a derived store behind a port.**

That rule answers every question of this kind. The rest of this page is what follows from it: where
each stream lives, what to build before load arrives, and what waits until it does.

---

## 1. The streams

| Stream | Written by | Store | Property |
|---|---|---|---|
| **Domain data** — tasks, goals, RBAC | use-cases | Postgres | Transactional; read after write |
| **Audit trail** — business facts | `ActivityLogger` | Postgres, partitioned | Must not be lost; in-transaction |
| **Domain events** — integration facts | `DomainEventPublisher` | Postgres outbox, partitioned | In-transaction, at-least-once, drained by the worker |
| **Diagnostics** — operator signal | `JsonLogger` | stdout → **Loki** | May be lost; 30-day retention |
| **Analytics** — aggregates over time | worker, from domain events | Postgres snapshots → ClickHouse | Derived; rebuildable |

[Vocabulary](vocabulary.md) separates an activity name (`task.reactivated`, a business fact a user
may read) from a log event code (`queue.job.failed`, a diagnostic an operator reads). **A business
fact in stdout is lost on restart; a diagnostic in Postgres is a retention bill.**

### Audit is not a log

`ActivityLogger` writes inside the transaction, so a state change and its audit row commit together.
No external store can join that transaction: with one, a reactivation commits, the audit write is in
flight, the process restarts, and a state change has no record of who made it — the record a
compliance review looks for first. **Audit is Postgres at every scale.** If audit *search* gets
slow, replicate it to an analytical store and keep Postgres as the record.

> [!IMPORTANT]
> **In-transaction is a claim about the code.** `UnitOfWork` must actually enrol the repositories
> that run inside it, or the audit row and the state change commit separately.

### Diagnostics are not a database

`JsonLogger` emits structured JSON with a level and a correlation ID, and is the one file allowed to
call `console`. Stdout goes to a log platform, so retention, search, alerting and level filtering are
configuration. Deployment is Alloy tailing container stdout into S3 or MinIO; retention is
`retention_period: 720h`. `JsonLogger` never learns the platform exists, which keeps it a
[Tier 0](dependencies.md) dependency and any swap a config change.

**Loki, chosen for ecosystem over engineering.** VictoriaLogs is faster, has no cardinality trap and
uses less disk. Loki wins on what "best" means at 2am: Grafana Labs behind it, the CNCF default,
years of written answers, and Grafana Cloud running the identical thing if self-hosting stops being
worth it.

**The reader is the super admin dashboard, not Grafana.** Grafana was removed: it made two consoles
for one operator, and it could not express the query that matters — *these logs, for this tenant,
joined to that tenant's audit rows*. The seam is `LogReader`, implemented by `LokiLogReader`
(`fetch` against `query_range`, built only when `LOKI_URL` is set). The write path has no seam
because it has no dependency. `LogQuery` offers the four labels and a body substring filter and
nothing else, so the cardinality rule is enforced by the port's shape. `docker compose logs`, curl
and the port stay the break-glass path for when the app is down.

The dashboard has its own tier: `platform` is a third `PermissionScope`, held only through a role
in the organization marked `is_platform` — no admin email list, no `users` flag, no second
permission system, and no tenant owner's wildcard reaches it. See
[platform-scope](../../packages/permissions/docs/reference/platform-scope.md); it starts at
`/platform/status`.

> [!WARNING]
> **Label cardinality decides whether Loki is fast or miserable.**
>
> ```
> ✓ labels:  app, env, level, event_code
> ✗ labels:  user_id, trace_id, task_id, organization_id
> ```
>
> A label makes one stream per value; `user_id` at 100k users is 100k streams. High-cardinality
> fields stay in the line, queried after the selector narrows:
>
> ```logql
> {app="web", level="error"} | json | trace_id="abc123"
> ```
>
> `Correlation` and `TraceId` from `@loadbearing/observability` must stay in the body.

**`EVENT_CATALOG` is `event_code`'s cardinality budget**, plus one: `error.raised`, whose level comes
from `ERROR_CATALOG[code].severity`. Keep codes coarse — one code with a `queue` field beats one per
queue.

**Revisit only if search latency is a real complaint during an incident.** Then: **VictoriaLogs**
(single binary, fastest, youngest), **OpenObserve** (best UI, S3-native), or **SigNoz**
(ClickHouse-backed — attractive if ClickHouse already runs for analytics, on a *separate* instance).
Not Elasticsearch: several times the storage and constant tuning, justified only when full-text
search is the main use.

### Task status history is domain data

Reactivation logic reads it to decide, KPI computation aggregates it, users see it in task detail.
It needs foreign keys and read-your-own-writes. Postgres is the source; an analytical store gets a
copy. *"What happened to this task"* is Postgres; *"reactivation frequency this quarter"* is
analytics.

---

## 2. Source of truth

**Postgres owns** tasks, goals, RBAC, memberships, overrides, task status history, the audit trail,
auth tables and user preferences — everything where a lost or late write means something is wrong.

**Different sources of truth:**
- **Diagnostics** live in the log platform and may be lost.
- **Uploaded bytes** live in S3; Postgres holds the metadata row and key. Deleting a resource is two
  operations.
- **Embeddings** live in pgvector — inside Postgres but derived, regenerable from source documents,
  which is what makes a Qdrant swap safe.

> [!NOTE]
> Postgres, S3 and the log platform hold non-derivable things, and no fact lives in two of them.
> "Single source of truth" prevents *ambiguity*, not *plurality*.

> **The test: if dropping a store loses information not recoverable from Postgres or S3, it has
> become a source of truth — whether you decided that or not.** Run it whenever a store is added,
> and again the first time something arrives as "just a cache".

### Redis

| Use | Rebuilt from | If flushed |
|---|---|---|
| Capability cache | Postgres RBAC tables | A slow minute, then warm |
| Session cache | Better Auth's `sessions` table | Slower auth; nobody logged out |
| BullMQ queues | — | **Lost work** |

The caches are read-through (`CapabilityCache` falls back to `PgCapabilityRepository`). **BullMQ is
not derived**: AOF covers a crash, but `FLUSHALL` is data loss. So:

- **Separate instances for cache and queue** — different durability, and the cache can be flushed
  without touching pending work.
- **Make jobs reconstructible where it matters.** A nightly sweep re-enqueues unprocessed work, so a
  lost job is a delay, not a gap; idempotent handlers make that safe. The sweep reconciles against
  **Postgres domain rows**, not BullMQ — completed and failed job records age out in an hour and a day.

> [!WARNING]
> The cache instance runs `allkeys-lru`. A session reached through `CacheStore` is a cache in front
> of Postgres: an evicted session is a read-through, never a sign-out.

### ClickHouse

Purely derived, which makes it a performance decision rather than a correctness one:

```
use-case → Postgres (authoritative) → domain event → worker consumer → ClickHouse
```

It can be dropped and rebuilt by replaying the activity log. Two guards, because it fails quietly:
**only the event consumer writes to it** (no direct writes, no backfills that are not replays), and
**a daily reconciliation** compares per-day counts against the activity log — the realistic failure
is a consumer that died on Tuesday and a quarterly report that looks wrong.

**How it stops being derived:** a KPI computed in a materialized view and stored nowhere else.

---

## 3. Volume, by scale

Planning estimates; what matters is the order of magnitude.

| | 500 employees | 25k employees | 100k DAU |
|---|---|---|---|
| Status changes / day | ~15k | ~750k | ~3M |
| Status changes / year | 5.5M | **270M** | **1B** |
| Activity rows / year | ~27M | **1.3B** | **5B** |
| Peak concurrent | ~100 | ~5k | ~15–20k |
| Peak writes / sec | <50 | 200–500 | **2–5k** |

- **Under 10M rows/year:** one Postgres with good indexes.
- **Around 250M rows/year:** partitioning is mandatory; analytics wants a column store.
- **Around 1B rows/year:** the single primary is at its ceiling; shard by tenant. 2–5k writes/sec
  fits one tuned primary, but with no headroom and every migration an event.

---

## 4. Build now

Each of these is the difference between a future swap and a future rewrite.

### 4.1 `organization_id` on every domain table

**The highest-value hour in the project.** It is the sharding key whichever way success arrives.
Now it costs a column and a `WHERE` in the repository base class; later it touches every table,
query, permission check and test, live, under pressure.

- **Never write a query that cannot be scoped to a tenant.** Cross-tenant aggregates belong in the
  analytics store from day one.
- **Every unique index gains the tenant column** — `roles_key_uq` on `(key)` alone blocks two
  tenants' `owner` roles.
- **It is a branded `OrganizationId`** — a swapped argument here is a cross-tenant leak, not an
  empty result.
- **Spell it `organization`**, never `organisation`.
- **No foreign key from a routed table to the catalog** (decision `24.1`, which removed ten).
  Postgres enforces no key across two databases, so keeping them meant abandoning the split. Nine
  did nothing already (the delete drops partitions before the `organizations` row; nothing deletes a
  user). `outbox_event` did real work, having no tenant level, so `PurgeOrganizationUseCase` sweeps
  it explicitly. What is given up is the database saying so: a leaked row is now rare rather than
  impossible, and the nightly `orphans` job notices it.
- **Catalog-sibling keys stay, as `NO ACTION`. Keys into a tenant-partitioned table do not**
  (`PF.1` dropped `messages` and `conversation_members` → `conversations`): attaching a partition
  validates every parent key under `SHARE ROW EXCLUSIVE` on the referenced table, so each signup
  blocked conversation inserts on the node five times. The code already refuses those writes; the
  `orphans` job counts leaks.

### 4.2 Partition the tables that grow with activity

**Append-only is not the test; append-only *and growing with activity* is.** A table that gains
rows because something happened qualifies; one that gains rows because time passed does not.
`activity_log` ships; `task_status_history` (the worked `task` feature) is the second example.

```sql
CREATE TABLE activity_log (
  id              uuid        NOT NULL,
  organization_id uuid        NOT NULL,
  occurred_at     timestamptz NOT NULL,
  -- …
  PRIMARY KEY (id, organization_id, occurred_at)
) PARTITION BY LIST (organization_id);
```

**Tenant first, month underneath.** Every partition key must be in the primary key (hence three
columns), so a reference to a tenant-partitioned table is a composite key on
`(id, organization_id)`. UUIDv7 and the time key are co-monotonic, so this is free at insert.

The two levels have different tests. **The month level** is for tables that grow with activity.
**The tenant level** is for every table a tenant owns: a tenant's read prunes to one subtree, deleting
a tenant is `DROP TABLE` rather than a cascade over years, and a physical split is a data move. The
one exemption is the outbox, which the drain polls every second and must not touch per tenant.

What partitioning buys: retiring a month is instant (`DROP PARTITION`, not a bloating `DELETE`);
each partition's index stays small; and a range query reads only the months it covers. **That last
one is narrower than usually written, and was measured:** a "last 30 days" floor prunes only the
retention tail (a future month could hold rows), and a keyset cursor as a row constructor,
`(created_at, id) < (at, id)`, does not prune at all — only an equality or closed range does. See
[partitions](../../packages/infrastructure/docs/reference/partitions.md), where each query is
asserted at the plan it actually produces.

> [!WARNING]
> **Set this up in the first migration.** Converting a large table later is a rewrite with
> downtime — the one decision on this page that is genuinely painful to retrofit.

**The list is code.** `PartitionedTable.ALL` in
`packages/application/src/primitive/partitioned-table.ts` is a frozen list of
`{ name, column, retentionMonths }`. `MaintenanceGateway` takes the union derived from it (Postgres
takes no bind parameters in DDL, so that closed union is the only boundary), and the monthly
schedule loops it. `retentionMonths: null` means something else owns the lifecycle —
`activity_log`'s archive drops a month only after its upload verifies. A table partitioned in a
migration but missing from the list stops getting partitions when its runway ends, so
`check-architecture` §21 asserts the list against the migrations both ways. Create partitions ahead
with a scheduled job or `pg_partman`. **Drizzle cannot express `PARTITION BY`**: the generated DDL is
edited, which works because migrations are generated, read and committed, never pushed.

**Not on the list, deliberately:**
- **`session`** — Better Auth updates and deletes it and looks rows up by id, a predicate with no
  partition key. It is bounded by expiry: `DELETE … WHERE expires_at < now()` on the cleanup schedule.
- **`partition_archive`** — append-only, but it grows with tenants × tables × the calendar, not with
  activity, and its reads arrive holding a tenant and table, not a time range.

**Retention means archive-then-drop.** 12–24 months of detail in Postgres, aggregates forever in
analytics, and every older month in S3 at `cold/<table>/<yyyy>/<mm>/<organization_id>.ndjson.gz`
behind a `partition_archive` row, detached, streamed and verified before the drop
([cold storage](../../packages/infrastructure/docs/reference/cold-storage.md)). Nothing is
destroyed, `outbox_event` included. A month with no rows writes no object, so an absent row means
"nothing to restore". **The numbers are rows**: `retention_policy` (per store and table, an absent row
meaning `PartitionedTable`'s value) and `tenant_retention_policy` (per tenant, possible because a
tenant's month is its own partition). Bucket lifecycle rules and the ClickHouse TTL are converged to
those rows nightly.

### 4.3 The analytics write path is built; the read seam is not

`AnalyticsProjector`, `ClickHouseAnalyticsProjector`, the projection consumer and the nightly
reconciliation ship, switched on by `CLICKHOUSE_URL`. **Nothing reads the store back, deliberately.**
The kit once shipped an `AnalyticsReader` with two methods, two rollup tables, a ClickHouse
implementation and an `ANALYTICS_DRIVER` flag; nothing called it, so its shape was a guess kept in
step by hand. It was deleted until a dashboard asks — [simplicity](simplicity.md) applied to its own
example.

**When a dashboard needs one, decide the signature first:**

```ts
public abstract goalRiskScores(
  goalIds: readonly GoalId[],
): Promise<readonly RiskScore[]>;
```

- **Scope is a parameter.** The permission filter runs on the input before the query, resolved by
  `capabilities.goalsWith()`, exactly like `VectorStore.search()` (read that first). An analytics
  store knows no `CapabilitySet`, so scope must arrive resolved.
- **It goes in `port/`**, as one cross-cutting read seam over many subjects (like `VectorStore`, unlike
  `TaskRepository`).
- **Async from day one** — ClickHouse cannot answer synchronously, so a sync seam makes the swap a
  breaking change at every call site.
- **Writes come through domain events, never use-cases.** The store stays a rebuildable read model;
  the moment it holds the only copy of something, a rebuild is data loss.

#### Deletion rules

- **Cascade from the tenant; `NO ACTION` between siblings.** `memberships.role_id` and
  `invitations.role_id` stop an in-use role being deleted, but `NO ACTION` defers the check to
  statement end so `DELETE FROM organizations` can cascade roles and memberships together; `RESTRICT`
  would reject its own cascade.
- **The audit trail is the exception.** `activity_log.actor_id` is no foreign key at all — an audit
  row outlives its actor, and a cascade would erase a deleted account's trail exactly when it
  matters. Retention removes those rows, not referential integrity.

### 4.4 Index every foreign key and filtered column

Postgres does not auto-index foreign keys. `memberships_user_idx` and `goal_members_user_idx` are
non-optional because `CapabilityRepository.resolveFor()` runs on nearly every request, and the same
holds for every later key.

**The index must *lead* with the key column.** `goal_members_user_idx` is
`(organization_id, user_id)` — right for the resolver, useless to a user-delete cascade, which is not
tenant-scoped and table-scans under a lock. Four tables were in that state, which is why it is
assertion 18 in `check:architecture`. **Add a second index rather than reorder** (reordering trades a
per-request read for a rare write); name cascade-only ones `<table>_<subject>_fk_idx`.

**Add query-count assertions to integration tests now.** N+1 bites at 50 users and no database
choice fixes it.

### 4.5 Route by key from the first line

Every query resolves a database through a `DatabaseCluster` and a key, and every table is
`catalog`, `local` or `routed` — with one physical Postgres behind it, for a long time.

That is a seam before the thing it abstracts, which [Simplicity](simplicity.md) allows when **the
swap is certain and the retrofit is spread**. A single primary ends at some volume, and the retrofit
would span 183 `this.db` call sites, thirty-three repositories needing a placement under deadline,
and five sweeps. A dedicated vector store (#6 below) touches one adapter, so that seam earns nothing
early.

**What it bought:** `BaseRepository.db` throws when a catalog repository is used inside a routed
transaction, on one node, today. Two such call sites were found and fixed —
`PgNotificationRecipientReader.conversationMembers` (a routed-to-catalog join) and
`PgPartitionArchiveGateway` (a catalog write from a routed transaction). **What it did not:** no
placement policy, no second node in the default stack, no rebalancer. See
[sharding](../../packages/infrastructure/docs/reference/sharding.md).

---

## 5. Build when it hurts

Each is days, not months, because the seam exists. **Do not build them in advance.**

| # | Move | Trigger | Cost |
|---|---|---|---|
| 1 | Add an index, rewrite a query | A single slow query | Hours |
| 2 | KPI snapshot tables | Dashboard over 1s on a warm cache | A day |
| 3 | Read replica for dashboards | Reads competing with writes | A day; one adapter change |
| 4 | pgBouncer, transaction mode | Past ~100 connections | **Built** — always on |
| 5 | ClickHouse reads, behind a new `AnalyticsReader` | Snapshots stop covering ad-hoc queries | **One env var, then a day** |
| 6 | A dedicated vector DB behind `VectorStore` | pgvector recall or latency degrades | Days |
| 7a | The routing seam — cluster, directory, placements | — | **Built**, at one node ([4.5](#45-route-by-key-from-the-first-line)) |
| 7b | The physical split: a second Postgres, tenants moved | Writes past a single primary | Weeks → **days**; Phase 24 built the move |
| 8 | Broker-backed event bus | In-process dispatch saturates | Days — needs §6 |

Most products never pass #2. Exhaust the cheap ones first — "Postgres does not scale" usually comes
from someone who skipped #1 and #4.

**#4 was built in advance on purpose.** Once code is written against a direct connection,
`statement_timeout` moves to a role default, DDL splits onto a second URL, and every session `SET`
becomes a bug — an audit at a hundred connections versus one compose service at zero. The next
trigger is observable: `database.pool.saturated` on this side, `SHOW POOLS` on the other. See
[`upstream:docs/infra/reference/pgbouncer.md`](https://github.com/prodicle/loadbearing_tanstack_start_kit/blob/3fafa78c2f42d2d718236d7666429b858199118a/docs/infra/reference/pgbouncer.md).

### ClickHouse, by scale

- **500 employees: premature.** Half a million rows a year is an indexed Postgres table; snapshots
  cover the KPI rollups.
- **25k employees: planned for.** At 1.3B activity rows org-wide trending takes tens of seconds, and
  snapshots cannot answer ad-hoc or predictive questions.
- **100k DAU: required.**

The write path replays `activity_log`, so adopting it only changes where rows land:

1. `pnpm infra:up:analytics` — the container starts; nothing writes.
2. `CLICKHOUSE_URL=…` — the projection fills it and reconciliation reports.
3. Write the reader the dashboard needs, against a store that has been filling for days.

**Sit in step 2.** Filling is separate from reading so a dashboard never cuts over to a store still
backfilling — once spelled `ANALYTICS_DRIVER`, now simply the absence of a reader. What remains a
week is the rollup job (#2) and the real dashboard queries, not the infrastructure.

**What is projected is a row:** `projection_policy` holds one entry per activity action (projected
or not, optional TTL); an absent row means "projected, default window". Decide early — the
highest-volume actions are usually the least interesting. Excluding one later is not retroactive,
and past the audit table's window a gap can only be filled from cold storage.

---

## 6. What breaks before the database does

Patterns that fail at every scale here, which no store fixes.

**Capability resolution.** At 10k requests/sec a 60-second TTL is a miss storm every minute, each
running the three-query join. Both fixes are needed at that scale: **signed capability data in the
session cookie** (short TTL; a signature check, no network call) and **an in-process LRU in front of
Redis** (5,000 entries at 10 seconds absorbs most of a thousand-user working set per instance).
**The revocation window is the shortest TTL in the chain — 60 seconds, no longer**, cookie included;
the TTL is a backstop for a forgotten invalidation. A desktop shell has no cookie, so bearer tokens
pay full resolution and lean on the LRU; a long-lived desktop token must be reconciled with the
60-second window explicitly.

**Digest fan-out.** Naively, 100k recipients is 100k resolutions and query sets. **Group recipients
by capability shape, compute once per group, personalise at render.** `SendNotificationDigestUseCase`
([source](../../packages/application/src/notification/send-notification-digest.use-case.ts))
already pages recipients by 200 with one address-and-locale query per page and sends through
`MailPublisher`, so slow SMTP cannot stall the scan. It does not group yet because it resolves no
capability — it reads each recipient's own rows. Grouping is needed the first time a digest queries
the domain rather than the inbox.

**Aggregate views.** A capacity view over every employee's tasks is a live join over everything;
past a few thousand employees it must be a materialized view on a schedule.

**Notification write amplification.** One change notifying five people is 5× the writes.
[`notification.schema.ts`](../../packages/infrastructure/src/pg/schema/notification.schema.ts) is
`PARTITION BY RANGE (created_at)` keyed `(id, created_at)` from the first migration, and
`notifications` is in `PartitionedTable`, so `MaintenanceConsumer` creates its months ahead and
archives and drops them after twelve.

**Message fan-out.** A message to N members is one row and N realtime publishes, bounded three ways
([messaging](../../packages/application/docs/reference/messaging.md)): the body is published once on
the conversation channel; user channels get a compact frame only for the three list-reordering
events; and notifications fire only for direct conversations. **Unread is computed, not counted**:
`last_read_at` is the only state, the count a capped `LATERAL` per page row, so no per-member write
per message. At 100k it moves behind a Redis counter with `last_read_at` still the record.

> [!TIP]
> Load-test these paths at 10× expected volume **before** launch with realistic data. Everything
> else can be fixed reactively; these take a week to unpick.

---

## 7. What holds unchanged

At every scale on this page:

- **`packages/application`** — sharding is a repository and DI-root concern. Use-cases declare a
  `UnitOfWork` and call `findBy…`; the repository's placement and the container's key pick the pool.
- **`packages/permissions`** — pure computation, no I/O.
- **`packages/contracts`** — one more branded identifier.
- **The web tier** — stateless: no request state in `Container`, no module-scope `QueryClient`,
  sessions in Postgres and Redis. Scaling is `replicas: 40`.
- **Workers** — BullMQ repeatable jobs dedupe across replicas; consumers scale on queue depth.
- **Event handlers** — a broker changes the dispatcher, not the subscribers.

**The event path is built broker-shaped:** `DomainEventPublisher.publish` is async and returns
nothing, handlers are idempotent on a stable event id, nothing assumes ordering, and no handler
exception reaches the publisher. **It is an outbox, not a bus:** publishing to a broker inside a
transaction cannot roll back, and publishing after commit loses the event on a crash; a row in the
same transaction, drained by the worker, has neither hole. `BaseRepository` joins the ambient
transaction, so it is one line at the call site.

An `EventBus` port was once declared, faked in `TestContainer` and bound nowhere — production would
have published into nothing while reading as correct. It was replaced by a port, adapter,
`Container` line, real publisher and real subscriber in one change; there is no `Bus` in the design.
**In-process dispatch is structurally impossible:** `SubscriberRegistry` is consulted only by
`OutboxConsumer` in the worker, and nothing in `apps/web` can reach one.

---

## 8. Target topology, by scale

### Up to ~5k employees

```
Postgres (primary)      catalog + node 0, one machine — domain · audit · history
  └─ shard_assignments    the directory: one row per tenant, naming node 0
Redis (cache)           capability cache · session cache · shard map  ← allkeys-lru
Redis (queue)           BullMQ                                ← noeviction, AOF
S3 / MinIO              uploads · Loki chunks
stdout → Alloy → Loki   diagnostics, 30 days
```

All five are in `infra/docker-compose.yml`, Loki storing into the existing MinIO. Partitioning and
`organization_id` are in place, unused. **ClickHouse is in the compose file behind an opt-in profile,
stopped** until §5's trigger, and `postgres-shard-1` sits behind the `sharded` profile for rehearsing
a split. **Catalog and node 0 on one machine is not a temporary simplification:** the catalog holds
`users`, `organizations`, RBAC and the directory at every scale; routed nodes hold what tenants
produce; nothing in the code knows they share a server.

### ~25k employees

```
Postgres (primary + read replica)   still catalog + node 0 — domain · audit · history
  ├─ partitioned monthly
  ├─ shard_assignments, every row still naming node 0
  └─ pgBouncer, transaction mode
Redis (cache / queue, separate)     capability cache · sessions | BullMQ
ClickHouse                          analytics aggregates, fed by domain events
pgvector or Qdrant                  embeddings, behind VectorStore
S3                                  uploads · Loki chunks
stdout → Alloy → Loki               diagnostics, 30-day retention
```

### ~100k DAU

```
Postgres catalog                    users · organizations · RBAC · shard_assignments
  └─ pgBouncer, read replica
Postgres node 1..N                  routed: everything a tenant produces
  ├─ read replica per node
  ├─ pgBouncer per node
  └─ activity_log and outbox_event on every one of them
Redis Cluster                       already split by concern before clustering
ClickHouse                          analytics · audit search
Qdrant                              embeddings
Kafka or Redis Streams              behind `DomainEventPublisher`, replacing the Postgres outbox
S3                                  uploads · Loki chunks
stdout → Alloy → Loki               diagnostics
```

> [!IMPORTANT]
> **The architecture holds at 100k DAU; the default deployment does not.** Every move is an adapter
> swap or infrastructure change with no business logic touched. But sharded Postgres, ClickHouse,
> Redis Cluster and forty app instances is a platform team's job — the architecture makes sure that
> team works on infrastructure, not a rewrite.

---

## 9. The decision, in one table

| Question | Answer |
|---|---|
| Tasks, goals, RBAC | Postgres |
| Task status history | Postgres, partitioned monthly |
| Audit trail | Postgres, partitioned monthly, **in-transaction** |
| Domain events | Postgres outbox, partitioned monthly, **in-transaction**, drained into BullMQ |
| Auth sessions | Postgres + Redis cache |
| Which database answers | `shard_assignments` on the catalog, one row per tenant, read through `ShardResolver` |
| Vectors | pgvector, behind `VectorStore` — `VECTOR_DRIVER` |
| Analytics aggregates | Postgres snapshots → ClickHouse, written by `AnalyticsProjector` — `CLICKHOUSE_URL`. No reader yet (§4.3) |
| System logs | stdout → **Loki**, 30-day retention, low-cardinality labels only; read through `LogReader` |
| Uploads | S3, presigned URLs, short TTL |

| Derived store | Rebuilt from | Guard |
|---|---|---|
| Redis — capability and session cache | Postgres | Read-through on miss |
| Redis — BullMQ | **Nothing** | Separate instance; AOF; re-enqueue sweep |
| ClickHouse | Activity log replay | `AnalyticsProjector` is the only writer; nightly reconciliation |
| pgvector or a dedicated store | Source documents | Re-embed |

**Do now:** `organization_id` everywhere · partition `activity_log` and `task_status_history` · index
every FK · query-count assertions · separate Redis cache from queue.

**Do not do now:** *start* ClickHouse, a dedicated vector database, a **second Postgres**, a broker,
or write an `AnalyticsReader` before a dashboard asks. The routing seam is built
([4.5](#45-route-by-key-from-the-first-line)); running a second node is what waits. Building a store
before a real query is slow means designing for a load nobody measured.

> [!NOTE]
> **"The seam is implemented" and "the store is running" are separate decisions; only the second
> costs anything to be wrong about.** An adapter costs a day once; a store you do not need costs an
> operator forever, and a running store nothing writes to looks like a decision. The same holds for
> `VECTOR_DRIVER`, which has one legal value: a discriminated `driver` on `ContainerConfig` turns
> "swap the implementation" from a claim into a compiler-checked edit.
