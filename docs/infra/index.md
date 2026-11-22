---
title: infra
description: The local stack — every file, every service, and how they reach each other. Five containers, no profiles, one bridge network.
---

# `infra/`

> The files live in [`infra/`](../../infra/docs/index.md) at the repository root —
> `docker-compose.yml` and the Postgres init script — next to the compose file that mounts them.

Everything the application talks to, as containers. No package imports any of it: these are
[Tier 0](../opinions/dependencies.md) dependencies, reached over a protocol the code speaks anyway.
**This is the reference**; running it beyond a laptop is [deployment](deployment.md).

---

## Every file

| File | Read by | Explained in |
|---|---|---|
| `docker-compose.yml` | `docker compose` | [compose](reference/compose.md) |
| `postgres.init.sql` | Postgres, on first boot only | [postgres](reference/postgres.md) |
| `.env` | `docker compose` | [compose](reference/compose.md#host-ports) |

Redis, Mailpit and MinIO have no config file — flags, environment and defaults only
([redis](reference/redis.md), [mailpit](reference/mailpit.md), [minio](reference/minio.md)). Configs
are flat because each is one mounted file; `packages/infrastructure/src/` nests by vendor because each
vendor is several modules. **Structure is earned by contents** ([Simplicity](../opinions/simplicity.md)).

---

## How the services connect

One bridge network, `lite_default`; **containers reach each other by service name**.

```
                    ┌──────────────────────────── host ─────────────────────────────┐
                    │                                                               │
   pnpm dev ────────┼──→ :25432 postgres   :26379 redis   :29000 minio (S3)         │
   (apps on host)   │    :21025 mailpit (SMTP)                                      │
                    │                                                               │
                    └───────────────────────────────────────────────────────────────┘
                                              │
   ══════════════════════════ lite_default (bridge) ═══════════════════════════════════

     ┌──────────┐   ┌───────┐   ┌─────────┐   ┌───────┐ ←── mc mb ── ┌────────────┐
     │ postgres │   │ redis │   │ mailpit │   │ minio │              │ minio-init │
     └──────────┘   └───────┘   └─────────┘   └───────┘              └────────────┘
```

- **Nothing connects to the applications** — they dial Postgres, Redis, Mailpit and MinIO from the host.
- **Only `minio-init` talks to another container**, dialling `minio:9000` to create the bucket.
- **Logs go to stdout and nowhere else.** `docker compose logs` covers containers, your terminal the
  apps; collecting and searching them is [logs](../scale/logs.md).

### Ports: inside versus outside

Confusing the two is the usual "connection refused".

| Service | Inside the network | From the host |
|---|---|---|
| postgres | `postgres:5432` | `localhost:25432` — `DATABASE_URL` and `DATABASE_DIRECT_URL` |
| redis | `redis:6379` | `localhost:26379` — `REDIS_CACHE_URL` and `REDIS_QUEUE_URL` |
| mailpit | `mailpit:1025`, UI `mailpit:8025` | `localhost:21025`, UI `localhost:28025` |
| minio | `minio:9000`, console `minio:9001` | `localhost:29000`, console `localhost:29001` |
| minio-init | — | — |

**Two database URLs, one server**, so adding a pooler is `.env` and compose
([pgbouncer](../scale/pgbouncer.md)). **Two Redis URLs, one instance**, likewise
([split-redis](../scale/split-redis.md)).

---

## Startup order

```
minio ──started──→ minio-init ──→ exits 0
```

`minio-init` retries `mc alias set` until MinIO answers, so MinIO needs no healthcheck; everything else
starts in parallel. **`exited (0)` is success** — without it the first upload fails `NoSuchBucket` and
looks like a code bug.

---

## What flows where

| Data | From | To | Durable? |
|---|---|---|---|
| Domain rows, audit trail | use-cases | Postgres | **yes** — the source of truth |
| Uploaded files | `StorageGateway` | MinIO `ratchet` | **yes** — a second source of truth |
| Tenant exports | worker | MinIO `ratchet`, `export/` | no — expire after 7 days |
| Deleted-tenant archives | worker | MinIO `ratchet`, `cold/` | 30 days, then swept |
| Outbound mail | `SmtpEmailSender` | mailpit *(delivered nowhere)* | no — in memory, cleared on restart |
| Capability and session cache | `CacheStore` | redis | no — rebuilt from Postgres |
| Queued jobs | `QueuePublisher` | redis | **yes** — derived from nothing |
| Diagnostic log lines | `JsonLogger` | stdout | no — whatever your terminal keeps |

The rule ([Data and scale](../opinions/data-and-scale.md)): **Postgres owns anything a transaction
depends on or a user reads right after writing; everything else is a derived store behind a port.**
Cache and queue share one Redis, so it runs `noeviction` with durable AOF — the queue's rules win and
every cache key carries a TTL ([redis](reference/redis.md)).

---

## Running it

```bash
pnpm infra:up              # all five services   ← the normal command
pnpm infra:core            # the same thing — kept as an alias
pnpm infra:down            # stop everything, keep volumes
pnpm infra:reset           # stop everything, destroy volumes
pnpm infra:logs            # tail every service
```

No profiles; `down`, `reset` and `logs` still pass `--profile "*"` for any profiled service added later.
**Credentials are `ratchet` / `ratchet`, MinIO `ratchet` / `ratchetsecret`**, hard-coded on purpose (a
scratch database behind a secret is one nobody can debug). **A database migrated before the lite
squash needs `pnpm infra:reset`** — migrations are one baseline plus two small ones.

---

## Checking the whole stack

```bash
docker compose -f infra/docker-compose.yml ps
```

`postgres`, `redis`, `mailpit` `healthy`; `minio` `running` (no healthcheck); `minio-init` `exited (0)`.

| Symptom | Usually |
|---|---|
| `connection refused` from inside a container | Used the host port instead of the container port |
| `NoSuchBucket` on first upload | `minio-init` did not finish — `docker compose logs minio-init` |
| Migrations fail on an old volume | The volume predates the squash — `pnpm infra:reset` |
| Port already allocated | Something else owns it — [compose](reference/compose.md#host-ports) |

Per-service checks are on each reference page.
