---
title: docker-compose.yml
description: Five services, no profiles, three volumes and one network — what every block does and which parts are load-bearing.
---

# `docker-compose.yml`

The only file here Docker reads directly; it mounts everything else.

```yaml
name: lite
```

**The project name** prefixes every container (`lite-postgres-1`), volume (`lite_pgdata`) and the
network (`lite_default`). Two stacks with the same name on one machine share all three.

---

## The network

No `networks:` block, deliberately: Compose creates the bridge `lite_default` and joins every service.
**A service name is a hostname** (Docker's embedded DNS at `127.0.0.11`), which is why `minio-init`
can say `http://minio:9000`. Explicit networks buy segmentation — worth it in production, theatre on
one laptop.

---

## Services

| Service | Image | Notes |
|---|---|---|
| `postgres` | `pgvector/pgvector:pg17` | [postgres](postgres.md) |
| `redis` | `redis:7-alpine` | cache, queue and realtime; never evicts, always persists — [redis](redis.md) |
| `mailpit` | `axllent/mailpit:latest` | SMTP sink, mail in memory until restart — [mailpit](mailpit.md) |
| `minio` | `coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` | S3 stand-in — [minio](minio.md) |

**`minio-init` is a fifth, one-shot:** an `mc` image waits for the MinIO API, creates the `ratchet`
bucket and exits. `exited (0)` is success, and `compose-wait.mjs` holds the stack un-ready until then.
It has `restart: "no"` (or the project default would restart a container whose job is to finish) and
no healthcheck (a container meant to stop cannot be "unhealthy").

**It sets no CORS rule.** This MinIO has no per-bucket CORS API — `mc cors set` is refused as "not
implemented" — and answers every origin. Production S3 or R2 needs a rule allowing `POST` from the
app's origin, or browser uploads fail: [the bucket's CORS rule](../deployment.md#the-buckets-cors-rule).

### What lite does not run

The big kit also ran a pooler, a streaming replica, a second shard node and its pooler, split Redis,
Loki and Alloy, ClickHouse and a cold MinIO tier. The seams stay, so each is a port back:

| Missing piece | Porting guide |
|---|---|
| pgBouncer | [pgbouncer](../../scale/pgbouncer.md) |
| `postgres-replica` | [read-replica](../../scale/read-replica.md) |
| `postgres-shard-1` and its pooler | [shard-nodes](../../scale/shard-nodes.md) |
| `redis-cache` / `redis-queue` | [split-redis](../../scale/split-redis.md) |
| Loki and Alloy | [logs](../../scale/logs.md) |
| ClickHouse | [analytics](../../scale/analytics.md) |
| `minio-cold` | [retention](../../scale/retention.md) |

---

## Profiles

None — every service starts on every `up` (`docker compose ... up -d` runs 5); `pnpm infra:up` and
`pnpm infra:core` both run exactly that.

> **`down`, `reset` and `logs` still pass `--profile "*"`.** It changes nothing today, and keeps a
> profiled service added later — a ported pooler, say — from surviving a reset or missing from
> `logs -f`.

---

## Volumes

| Volume | Service | Rebuildable from |
|---|---|---|
| `pgdata` | postgres | migrations + seeds |
| `redisdata` | redis | **nothing** — it holds the queue |
| `miniodata` | minio | **nothing** — uploads are a second source of truth |

**Redis has a volume because the queue shares it** — a cache alone would not earn one. `pnpm
infra:reset` destroys all three, fine locally; anywhere with real pending work, flushing Redis here
flushes the queue too — clearing only the cache needs [split-redis](../../scale/split-redis.md).

**A volume migrated before the lite squash needs `pnpm infra:reset`**: migrations are now
`packages/infrastructure/migrations/0000_lite_baseline.sql` plus two small ones.

### Bind mounts

The one config file is mounted alone, read-only:

```yaml
- ./postgres.init.sql:/docker-entrypoint-initdb.d/01-extensions.sql:ro
```

Docker creates missing parent directories, so a single file lands in a path the image never had.

> **A single-file mount does not survive an editor that replaces the file** (new inode; the container
> keeps the old one). Restart the service after editing.

---

## Host ports

Every host port is a variable with a documented default; container ports are fixed:

```yaml
ports: ["${MINIO_CONSOLE_PORT:-29001}:9001"]
```

Collisions are real (`9001` was taken on the first run, later five at once), so each published port is
the well-known one with a prefix, readable as its service — lite uses `2xxxx`, clear of the big kit's
`1xxxx`.

**They live in the root `.env`, the only env file.** With `-f infra/docker-compose.yml` Compose's
project directory is `infra/`, so it once read `infra/.env` and the stack and apps disagreed about
where Postgres was. `pnpm infra:up` now goes through `tooling/scripts/compose.mjs`, which passes
`--env-file <root>/.env` only when it exists (the flag errors on a missing file, and CI has no `.env`).

| Variable | Default | Variable | Default |
|---|---|---|---|
| `POSTGRES_PORT` | 25432 | `SMTP_PORT` | 21025 |
| `REDIS_PORT` | 26379 | `MAILPIT_UI_PORT` | 28025 |
| `S3_PORT` | 29000 | `MINIO_CONSOLE_PORT` | 29001 |

CI gets these defaults, so `check:architecture` §27 asserts each equals `.env.example`, and pairs each
`*_PORT` with the URLs dialling it (`POSTGRES_PORT` ↔ `DATABASE_URL` and `DATABASE_DIRECT_URL`,
`REDIS_PORT` ↔ both Redis URLs). `MINIO_CONSOLE_PORT` and `MAILPIT_UI_PORT` have no counterpart — you
dial them. **Overriding one changes nothing inside the network**: `minio-init` still says
`minio:9000`.

---

## Healthchecks and `depends_on`

`depends_on` alone waits for a *start*, so every long-running service but MinIO has a healthcheck. The
only `depends_on` is `minio-init: depends_on: [minio]`; its retry loop does the rest.

**MinIO has no probe**, after two that could not run: `mc ready local` needed a binary the server
image lacks and an alias `minio-init` creates; `curl -sf /minio/health/live` died when the community
rebuild shipped no `curl`. Now `minio-init` retries `mc alias set` until the API answers — a real
readiness check needing only the chosen `mc` — and `compose-wait.mjs` passes `minio` on `running`
alone.

---

## Checking it

```bash
docker compose -f infra/docker-compose.yml --profile '*' config --quiet   # valid?
docker compose -f infra/docker-compose.yml --profile '*' config --services # what would run
docker network inspect lite_default --format '{{range .Containers}}{{.Name}} {{.IPv4Address}}{{"\n"}}{{end}}'
```

`config` resolves variables, applies `.env` and validates without starting anything — the fastest
check of an edit.
