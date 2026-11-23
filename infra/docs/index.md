---
title: infra/
description: Five containers the application dials and nothing imports — what this directory holds, what each service publishes, and the two conditions a new one has to clear.
---

# `infra/`

Below the bottom of the dependency graph, so not a package: nothing in `packages/` or `apps/` imports
anything here. These are [Tier 0](../../docs/opinions/dependencies.md) dependencies, reached over a
protocol the code speaks anyway (Postgres over `pg`'s wire format), so the seam already exists and
this directory only decides what listens on the other end. That is also why the local stack is real
containers, not in-process fakes — a filesystem S3 means the S3 path first runs on deploy day.

| | |
| --- | --- |
| **Directory** | `infra/` — not a package, no `package.json`, nothing to publish |
| **Entrypoint** | `docker-compose.yml`, always via `-f infra/docker-compose.yml` |
| **Depends on** | Docker, and the `.env` at the repository root |
| **Used by** | `pnpm dev`, `apps/web`, `apps/worker` — over TCP, never by import |
| **Environment** | development only; the production analogue is [deployment](../../docs/infra/deployment.md) |
| **Build** | none — `pnpm infra:up` pulls images and starts them |

```
infra/
├── docker-compose.yml      → five services, no profiles, one bridge network
├── postgres.init.sql       → vector, pg_trgm, uuid-ossp — run on first boot only
└── docs/                   → this page
```

## What belongs here

Both conditions are required:

1. **The app reaches it over a protocol, not an import.** Needing a `.ts` file makes it a package; the
   adapter belongs in `packages/infrastructure/src/<vendor>/`.
2. **A managed service replaces it in production with no code change.** If nothing rentable speaks the
   same protocol, the container is a dependency you cannot leave later.

**The second gets skipped**, which is how a local convenience becomes permanent. MinIO clears it — the
AWS SDK talks to it unchanged. A log platform that only receives stdout would get no folder in
`packages/infrastructure/src/` until something reads it over an API
([Folders](../../docs/opinions/folders.md)); lite runs none — logs are JSON on stdout, and adding one is
[logs](../../docs/scale/logs.md).

## What each service publishes

| Service | From the host | Spoken by |
|---|---|---|
| [postgres](../../docs/infra/reference/postgres.md) | `localhost:25432` | `drizzle-orm` + `pg` |
| [redis](../../docs/infra/reference/redis.md) | `localhost:26379` | `CacheStore`, `QueuePublisher`, BullMQ |
| [mailpit](../../docs/infra/reference/mailpit.md) | `localhost:21025`, UI `:28025` | `SmtpEmailSender` |
| [minio](../../docs/infra/reference/minio.md) | `localhost:29000`, console `:29001` | `StorageGateway`, AWS SDK |
| [minio-init](../../docs/infra/reference/minio.md) | — | nothing; creates the bucket and exits |

Two rows that look like mistakes: **one Redis for cache and queue** — the queue's rules win
(`noeviction`, durable AOF, a TTL on every cache key), and the two URLs stay separate so splitting is an
`.env` change ([split-redis](../../docs/scale/split-redis.md),
[Data and scale](../../docs/opinions/data-and-scale.md)); and **`minio-init` at `exited (0)` is
success** — without it the first upload fails `NoSuchBucket`.

## Running it

```bash
pnpm infra:up              # all five services   ← the normal command
pnpm infra:core            # the same thing — kept as an alias
pnpm infra:down            # stop everything, keep volumes
pnpm infra:reset           # stop everything, destroy volumes
```

No profiles; `down`, `reset` and `logs` still pass `--profile "*"` for any added later.
`docker compose -f infra/docker-compose.yml ps` should show `postgres`, `redis`, `mailpit` `healthy`,
`minio` `running`, `minio-init` `exited (0)`; troubleshooting is in
[`docs/infra/`](../../docs/infra/index.md#checking-the-whole-stack).

## See also

- [`docs/infra/`](../../docs/infra/index.md) — the stack reference and per-file pages;
  [deployment](../../docs/infra/deployment.md) is the same services on a rented box.
- [`@loadbearing/infrastructure`](../../packages/infrastructure/docs/index.md) — the adapters dialling
  these ports, one folder per vendor.
- [Data and scale](../../docs/opinions/data-and-scale.md) — which store owns what.
- [`docs/scale/`](../../docs/scale/index.md) — porting back what lite cut.
