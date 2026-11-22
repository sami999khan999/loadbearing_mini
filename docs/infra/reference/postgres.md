---
title: postgres
description: The source of truth — the pgvector image, the three extensions, and why the init script runs exactly once.
---

# `postgres`

Owns anything a transaction depends on or a user reads right after writing: domain rows, RBAC, the
audit trail, auth tables and embeddings.

| | |
| --- | --- |
| **Image** | `pgvector/pgvector:pg17` |
| **Inside the network** | `postgres:5432` |
| **From the host** | `localhost:25432` |
| **Credentials** | `ratchet` / `ratchet`, database `ratchet` |
| **Volume** | `pgdata` |
| **Config file** | `postgres.init.sql` |

**Why this image:** stock Postgres 17 with `vector` available to enable — the official image plus a
self-built pgvector means building an image on every machine and CI runner. **17 over 16** for its
`VACUUM` memory behaviour, which matters most on the activity log (whose real answer is partitioning
from the first migration).

---

## `postgres.init.sql`

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

Mounted at `/docker-entrypoint-initdb.d/01-extensions.sql`; the `01-` prefix is the entrypoint's sort
order, kept for a future second file.

- **`vector`** — the vector store's `vector(1536)` column does not exist without it; on stock Postgres
  the migration fails with an error reading like a typo.
- **`pg_stat_statements`** — answers "which query" before any scaling move. Needs
  `shared_preload_libraries=pg_stat_statements` (set by the compose `command`); the flag without the
  extension gives an absent view, not an error.
- **`pg_trgm`** — trigram fuzzy search (`WHERE name % 'searchterm'`). Every product wants it, and
  enabling it later takes a lock on a live database. Free until used.
- **`uuid-ossp`** — belt-and-braces: ids come from `Uuid.v7()` in code, but a repair script that
  invents an id should not need Node.

> **`"uuid-ossp"` is quoted for the hyphen** — unquoted it parses as `uuid - ossp` and the syntax
> error names neither.

**The init script runs only on an empty data directory** — the most common confusion: editing it and
restarting does nothing.

```bash
# apply a change to an existing volume
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U ratchet -d ratchet -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

# or start over
pnpm infra:reset
```

> Address the container by **service name** (`postgres`), not a substituted container ID — the
> commands then work identically in PowerShell and bash.

---

## Who connects, and how

| Consumer | Reaches it at | For |
|---|---|---|
| `apps/web`, `apps/worker` (host) | `localhost:25432` | everything, via `DATABASE_URL` |
| `migrate.ts`, `seed.ts`, `drizzle-kit` (host) | `localhost:25432` | DDL, via `DATABASE_DIRECT_URL` |
| `PgPartitionArchiveGateway` | `localhost:25432` | `DETACH … CONCURRENTLY` and a month-long stream |

**Two hostnames for one database**, by which side of the bridge the client is on — a container using
`localhost:25432` reaches its own loopback.

- **Two URLs, one server, no pooler.** `DATABASE_DIRECT_URL` is kept as a name so adding a pooler is
  `.env` and compose, not code ([pgbouncer](../../scale/pgbouncer.md)).
- **The code is already written for a transaction pooler:** it sets nothing per session, and the
  timeout floor (`statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout`) is an
  `ALTER ROLE` in the baseline migration, holding with or without one.
- **Each process pools `DATABASE_POOL_MAX` connections (20 in `.env.example`)**, each a real backend
  with no pooler — count processes against `max_connections`.
- **`max_connections` is 200**, set by the compose `command` with
  `shared_preload_libraries=pg_stat_statements`, `track_io_timing=on` and
  `max_locks_per_transaction=1024` — raised because every tenant is partitions, and an unprunable
  statement locks every leaf ([partitions](../../../packages/infrastructure/docs/reference/partitions.md)).

**A volume migrated before the lite squash needs `pnpm infra:reset`** — migrations are now
`packages/infrastructure/migrations/0000_lite_baseline.sql` plus two small ones.

---

## One container is the catalog and node 0 at once

Deliberately one Postgres. The app reaches it through a `DatabaseCluster` and a key, every table is
`catalog`, `local` or `routed`, and every tenant's `shard_assignments` row names node 0 — so routing
runs for real on one machine, and a second node is environment variables. Lite runs no second node or
replica: `DATABASE_SHARD_<n>_URL` and `DATABASE_REPLICA_URL` are still read, and unset means one node
with every read on the primary. Add either via [shard-nodes](../../scale/shard-nodes.md) or
[read-replica](../../scale/read-replica.md); see
[sharding](../../../packages/infrastructure/docs/reference/sharding.md). **`pgvector` must be on every
node**, so a new node shares the init script — an embedding column on a node without it fails at
insert, not boot.

---

## Checking it

```bash
docker compose -f infra/docker-compose.yml exec postgres \
  psql -U ratchet -d ratchet -c "SELECT extname FROM pg_extension;"
```

`vector`, `pg_trgm`, `uuid-ossp` beside `plpgsql`; a missing `vector` means the volume predates the
script.

```bash
docker compose -f infra/docker-compose.yml exec postgres pg_isready -U ratchet -d ratchet
```

The same command the healthcheck runs.
