---
title: Deployment
description: One VPS now, managed services later — what changes, what never changes, and the order to move things in when it stops fitting on one box.
---

# Deployment

The same services on a rented machine, then, service by service, on machines somebody else operates.
**The application code never changes between stages:** every store is behind a port
([Dependencies](../opinions/dependencies.md)), every credential is an `.env` value, and no package
reads `process.env` — so each move is a config change, not a migration.

> **Nothing on this page has been executed.** The local stack in [index](index.md) is verified; this
> is design, and the first real deployment will find what it got wrong.

---

## First: the ports are wide open

The compose file publishes every service on **all interfaces**:

```
postgres      0.0.0.0:25432->5432/tcp
redis         0.0.0.0:26379->6379/tcp    ← no password
mailpit       0.0.0.0:21025->1025/tcp, 0.0.0.0:28025->8025/tcp   ← no auth
minio         0.0.0.0:29000->9000/tcp, 0.0.0.0:29001->9001/tcp
```

Harmless behind NAT; **on a public VPS it is a database, an unauthenticated Redis holding the job
queue, a mail inbox and an object store on the internet**, and scanners find an open Postgres in
minutes.

> [!CAUTION]
> **A firewall does not fix this.** Docker writes iptables rules into `DOCKER-USER`, evaluated
> *before* UFW's chains — `ufw deny 5432` reports active and the port stays reachable.

**Stop publishing instead of filtering.** Container-only services need no `ports:` (they are
reachable on the bridge network by name); the overlay below removes every publish but the proxy's.
For host access (`psql` from a laptop), bind to loopback and tunnel:

```yaml
ports: ["127.0.0.1:25432:5432"]
```

```bash
ssh -L 5432:localhost:25432 you@vps    # then psql against localhost:5432
```

---

## Phase 1 — one VPS

Everything on one box under Compose, no orchestrator — the right shape for a long time; most products
never outgrow it ([Data and scale](../opinions/data-and-scale.md)).

| | vCPU | RAM | Disk |
|---|---|---|---|
| Minimum to run | 2 | 4 GB | 40 GB SSD |
| Comfortable | 4 | 8 GB | 80 GB SSD |

Postgres wants the memory; disk is mostly `pgdata` and MinIO. There is no log or analytics store:
logs go to stdout, and Docker's log driver keeps what it keeps.

### The production overlay

Keep `docker-compose.yml` as the base and add a file with only the differences; Compose merges left
to right:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**`infra/docker-compose.prod.yml`** — illustrative; write it on the host, it is not in the repository.

```yaml
services:
  # ── stop publishing anything but the proxy ────────────────
  postgres:
    ports: !override []
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
    deploy:
      resources:
        limits: { memory: 2G }

  redis:
    ports: !override []
    command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction",
              "--requirepass", "${REDIS_PASSWORD:?required}"]

  # Only while you have no real provider. Production mail goes out through `SMTP_URL`.
  mailpit:
    ports: !override []

  minio:
    ports: !override []
    environment:
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:?required}

  # ── the applications, which are containers here ───────────
  web:
    build: { context: .., dockerfile: apps/web/Dockerfile }
    restart: unless-stopped
    # One web process per core: rendering is single-threaded, and one process leaves the
    # other cores idle. cluster.mjs forwards SIGTERM, drains each worker and restarts a
    # crashed one. It starts no more than WEB_DATABASE_CONNECTIONS / DATABASE_POOL_MAX
    # processes, and refuses a WEB_PROCESSES whose product is over that budget.
    command: ["node", "apps/web/cluster.mjs"]
    env_file: [.env.production]
    environment:
      APP: web
      ENV: production
    depends_on:
      postgres: { condition: service_healthy }

  worker:
    build: { context: .., dockerfile: apps/worker/Dockerfile }
    restart: unless-stopped
    env_file: [.env.production]
    environment:
      APP: worker
      ENV: production
    depends_on:
      postgres: { condition: service_healthy }

  # Every open browser stream, and nothing else. The same `.env.production`, so the
  # same `AUTH_SECRET` — the web app signs the cookie this process reads.
  realtime:
    build: { context: .., dockerfile: apps/realtime/Dockerfile }
    restart: unless-stopped
    env_file: [.env.production]
    environment:
      APP: realtime
      ENV: production
      REALTIME_PORT: "3001"
    # Longer than `REALTIME_SHUTDOWN_TIMEOUT_MS`, or Docker kills the drain half-way.
    stop_grace_period: 30s
    depends_on:
      postgres: { condition: service_healthy }

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddydata:/data
    depends_on: [web]

volumes:
  caddydata:
```

- **`!override []`** replaces the base `ports` list; without it Compose appends and the publish stays.
- **`${VAR:?required}`** refuses to start on an unset variable — a Redis started with
  `--requirepass ""` accepts every connection.
- **The one Redis keeps `noeviction`**: it holds the queue as well as the cache, so the queue's rule
  wins ([redis](reference/redis.md)). A cache that should evict wants its own instance —
  [split-redis](../scale/split-redis.md).
- **`minio-init` still runs in production**: it creates the bucket on a fresh volume and exits.

### Readiness

`depends_on: … service_healthy` orders container *starts*; it says nothing about whether the app can
serve. **`GET /api/health` is that answer** — point the load balancer, orchestrator or Caddy at it,
not at an open port:

```yaml
  web:
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s
```

**Use it as a readiness probe, never liveness.** Readiness holds an instance out of the pool while
Postgres starts; liveness on the same endpoint kills the container and turns one slow database into a
restart loop everywhere. The report names `database`, `cache`, `queue`, `realtime` and `analytics`
(always `null` in lite — neither healthy nor degraded). **No log store is in it, and none would be
once ported** — logs are lossy by design, so a down collector is no reason to drain a working instance.

**The worker has no HTTP surface.** Its liveness is the `process.started` line with its consumer
count; its readiness is that it consumes. Watch queue depth — no probe finds a worker that died
quietly on a Tuesday.

### Logs

The apps are containers here, not host processes as locally. Each writes JSON lines to stdout, read
with `docker compose logs web`; nothing else collects them. `APP: web|worker|realtime` sets the `app`
field in every line, which tells the three apart once mixed. Searching across days or keeping logs
past a restart needs a log store — [logs](../scale/logs.md); the line format does not change.

### TLS

**`infra/Caddyfile`** — illustrative; write it on the host.

```
example.com {
    # Before the catch-all. `flush_interval -1` writes each event as it arrives; Caddy
    # already streams `text/event-stream`, and saying so survives a config refactor.
    handle /api/realtime/* {
        reverse_proxy realtime:3001 {
            flush_interval -1
        }
    }
    # Compressed here and only here: an encoder buffers, and a buffered stream stalls.
    handle {
        encode zstd gzip
        reverse_proxy web:3000
    }
}
```

- **Compress web responses at the proxy** — Node sends them raw, and a large doc page is ~1.1 MB raw
  vs 59 KB gzipped (the sidebar repeats class names per link). **Never the stream path**: a buffered
  event stream arrives late or never. In nginx: `gzip on` in the web location only.
- **Streams go to their own process.** Every tab holds one or two streams while open; `apps/realtime`
  holds all of them so the web event loop holds none. One origin keeps the session cookie riding
  along. In nginx the stream location needs `proxy_buffering off` and `proxy_read_timeout` above the
  thirty-minute stream age.
- Caddy issues and renews Let's Encrypt certificates; `caddydata` persists them (without it every
  deploy re-issues and hits rate limits). Both targets are bridge-network service names; Caddy is the
  only published port.

### Secrets

`.env.production` lives on the VPS, never committed — `.gitignore` covers `.env.*` except
`.env.example`. Local values are `ratchet` on purpose (a scratch database behind a secret is one
nobody can debug); generate real ones:

```bash
openssl rand -base64 32      # AUTH_SECRET, POSTGRES_PASSWORD, REDIS_PASSWORD, …
```

Docker secrets, SOPS or a cloud secret manager improve on a file without changing the application,
which reads `process.env` in exactly two files.

### Deploying

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml build web worker
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm web pnpm db:migrate
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Migrate as a one-shot before new containers start**, or old code briefly meets the new schema.
Hence: **every migration must work with the currently running code** — add a column, deploy the
writer, drop the old column later; a rename is two deploys. Building on the VPS is slow; building in
CI and pushing to a registry only turns `build:` into `image:`.

### Backups — the part that matters

What cannot be rebuilt must be backed up:

| Volume | Back up? | Why |
|---|---|---|
| `pgdata` | **yes** | the source of truth |
| `miniodata` — uploads | **yes** | uploaded bytes are a second source of truth |
| `miniodata` — `cold/` | **yes** | a deleted tenant's archive, the only copy for its 30 days |
| `miniodata` — `export/` | no | a download that expires after 7 days; run the export again |
| `redisdata` | **yes** | a queued job is derived from nothing; the cache inside it rebuilds |

```bash
# nightly, to somewhere that is not this VPS
docker compose exec -T postgres pg_dump -U ratchet -Fc ratchet > backup-$(date +%F).dump
mc mirror local/ratchet /backup/ratchet   # `mc` on the host; the server image ships none
```

> **A backup you have not restored is a hypothesis.** Restore into a scratch database and run the app
> against it on a schedule — the most skipped step on a self-hosted VPS, and the unrecoverable one.

`pg_dump` suits a few tens of gigabytes; past that, WAL-G or pgBackRest to object storage gives
point-in-time recovery — and managed Postgres starts looking cheap.

---

## What breaks first

In rough order, and none is the database:

| Symptom | Move to |
|---|---|
| Deploys have visible downtime | Two `web` replicas behind Caddy, drain on stop |
| Disk fills | S3 for uploads; MinIO on the same disk as `pgdata` is the trap |
| Logs are gone after a restart, or cannot be searched | A log store — [logs](../scale/logs.md) |
| Postgres runs out of connections | A pooler — [pgbouncer](../scale/pgbouncer.md) |
| Postgres CPU spikes on dashboards | KPI snapshot tables — [Data and scale](../opinions/data-and-scale.md) §5 — or a [read replica](../scale/read-replica.md) |
| A bad deploy loses queued jobs | Managed Redis for the queue, with real persistence |
| One machine is a single point of failure | Everything below |

**Two web replicas is the best early move** — the web tier is stateless (no request state in
`Container`, no module-scope `QueryClient`, sessions in Postgres and Redis), and the worker scales
separately since BullMQ repeatable jobs dedupe across replicas.

**One queue can scale alone:** `WORKER_QUEUES` picks the queues a worker service serves.

```yaml
  worker:
    environment: { APP: worker, WORKER_QUEUES: "mail,event,notification,maintenance" }
  worker-embedding:
    build: { context: .., dockerfile: apps/worker/Dockerfile }
    env_file: [.env.production]
    environment: { APP: worker, WORKER_QUEUES: embedding }
    deploy: { replicas: 3 }
```

Every queue needs at least one service — an unserved queue fills silently. See
[the supervisor](../../apps/worker/docs/reference/supervisor.md).

---

## Phase 2 — managed services, in risk order

Move in **increasing order of how much a mistake hurts**, not cost. Each row is a line or two in
`.env.production` and a restart.

| # | Service | Becomes | Config change | Risk |
|---|---|---|---|---|
| 1 | MinIO | S3 / R2 | `S3_*`, `S3_FORCE_PATH_STYLE=false` | low — copy, then flip |
| 2 | Redis | managed Redis with `noeviction` and persistence | `REDIS_CACHE_URL`, `REDIS_QUEUE_URL` | medium — drain first |
| 3 | Postgres | RDS / Cloud SQL / Neon | `DATABASE_URL`, `DATABASE_DIRECT_URL` | high — the real migration |

**Mail is not a row** — Mailpit was never a production service; point `SMTP_URL` at a real provider
before the first real user ([mailpit](reference/mailpit.md)). **Stores lite does not run are not rows
either**: a log store, analytics store, pooler, replica or second shard node is a new capability —
see [below](#adding-what-lite-cut).

### 1. Object storage

Objects are immutable and keyed, so it is a copy and a flip:

```bash
mc mirror --watch local/ratchet s3/your-bucket    # runs until you stop it
```

Then change five values and restart. `S3_FORCE_PATH_STYLE=false` is the easy one to miss; it shows as
DNS errors naming a bucket-prefixed host. **Copy the whole bucket, prefixes included** — `cold/` holds
deleted tenants' archives; `export/` can stay behind (objects expire in a week), and the nightly
`retention` job writes its lifecycle rule onto the new bucket on first run.

#### The bucket's CORS rule

Browsers upload doc images straight to the bucket; MinIO answers
every origin, S3 and R2 none, and the failure is a browser CORS error in no server log. Allow only
`POST` — the upload is a presigned `POST` whose policy binds size and type. `GET`/`HEAD` are
unnecessary: `/api/doc-image/…` redirects an `<img>` to a signed URL.

```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://app.example.com"],
      "AllowedMethods": ["POST"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

```bash
aws s3api put-bucket-cors --bucket your-bucket --cors-configuration file://cors.json
aws s3api get-bucket-cors --bucket your-bucket     # read it back
```

`AllowedOrigins` is `APP_BASE_URL` with no trailing slash, one entry per origin (add staging to the
same rule). R2 takes the same JSON in the bucket settings. Local MinIO has no bucket CORS API
(`mc cors set` is "not implemented"), so `minio-init` leaves it alone — see
[the compose reference](reference/compose.md).

### 2. Redis — treat it as the queue

Lite's one Redis holds the cache and the queue. The cache alone would be trivial; the queue holds
jobs that exist nowhere else and sets the procedure:

1. Stop consumption with `pnpm queue:pause all`; publishers keep enqueueing to the old instance.
2. Wait for depth zero.
3. Flip `REDIS_CACHE_URL` and `REDIS_QUEUE_URL`, restart everything.
4. Confirm the old instance is empty before deleting it.

**A good moment to split:** the code already reads two URLs, so point `REDIS_CACHE_URL` at an
evicting instance and `REDIS_QUEUE_URL` at a non-evicting one ([split-redis](../scale/split-redis.md));
the cache half then needs no drain. Check each provider's `noeviction` support and persistence — a
queue on an evicting instance loses work silently.

### 3. Postgres last

Highest value, highest risk, and most worth paying for — backups, point-in-time recovery and failover
stop being your problem.

- **Dump and restore:** simple, with a maintenance window sized by your data.

  ```bash
  pg_dump -Fc $OLD | pg_restore -d $NEW
  ```

- **Logical replication:** near-zero downtime, more moving parts — replicate, let it catch up, pause
  briefly to switch `DATABASE_URL` and `DATABASE_DIRECT_URL`. Most providers document or tool it.

**Check extensions on the target first** — `pgvector` is not everywhere:

```sql
SELECT * FROM pg_available_extensions WHERE name IN ('vector', 'pg_trgm', 'uuid-ossp');
```

**Confirm partitioned tables arrived partitioned.** `pg_dump`/`restore` preserves it; a naive
`COPY`-based migration flattens `activity_log` into a table needing the painful conversion later.

**Both URLs move together** — in lite they name the same server. If the provider fronts it with a
pooler, `DATABASE_URL` gets the pooled address and `DATABASE_DIRECT_URL` the direct one
([pgbouncer](../scale/pgbouncer.md)); the code already runs unchanged behind a transaction pooler.

---

## Adding what lite cut

Not the same capability run by someone else: each is a **new store or process** on its own timeline.
The code keeps every seam, so each is a port back, not a rewrite.

| Piece | When | Guide |
|---|---|---|
| A connection pooler | Postgres runs out of connections | [pgbouncer](../scale/pgbouncer.md) |
| A read replica | batch reads compete with requests | [read-replica](../scale/read-replica.md) |
| A second shard node | one Postgres cannot hold every tenant | [shard-nodes](../scale/shard-nodes.md) |
| Split Redis | the cache wants to evict, or flushing it must spare the queue | [split-redis](../scale/split-redis.md) |
| A log store | stdout stops being enough | [logs](../scale/logs.md) |
| An analytics store | snapshot tables stop covering the questions | [analytics](../scale/analytics.md) |
| Calendar retention and a cold tier | old months cost more than they are worth | [retention](../scale/retention.md) |

**Do not start here:** one Postgres covers this kit's questions for years
([Data and scale](../opinions/data-and-scale.md)).

---

## What never changes

- **`packages/application`** — sharding and hosting are repository concerns.
- **`packages/permissions`** — pure computation, identical in every runtime.
- **`packages/contracts`** — unchanged.
- **The event catalog and four log labels** — stdout today, a log store later; the vocabulary stays.
- **Every port** — `CacheStore`, `QueuePublisher`, `StorageGateway`, `VectorStore`, `EmailSender`;
  a managed service is one different constructor argument in `Container`.
- **`.env` as the only config surface** — `check-architecture.mjs` §3, so moving a service is never a
  code search.

The compose file, the overlay and `.env.production` are the whole deployment surface — the
architecture's claim, and this page is where it holds or does not.
