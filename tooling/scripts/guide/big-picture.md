## What it is

The kit is a ready-made base for a software product that many companies use at once. Each company
gets its own private space, called an **organization**. You, the super admin, look after all of
them together.

## The three programs

The kit runs as three separate programs. Each does one kind of work, so a slow job in one never
holds up the others.

| Program | What it does | Where it lives |
|---|---|---|
| **Web app** | Every page you see, and every button you press | `apps/web`, port 23000 on your machine |
| **Worker** | Work that happens in the background: sending email, nightly clean-ups, exports, deletes | `apps/worker` |
| **Stream process** | Keeps a live line open to each browser tab, so the bell updates without a refresh | `apps/realtime`, port 23001 |

## The four services

The programs keep their data in four services. On your machine, all four run in Docker.

| Service | What it holds |
|---|---|
| **Postgres** | Everything that matters: accounts, organizations, roles, docs, the history of who did what |
| **Redis** | Two jobs. A short-term memory (cache) that makes pages fast, and the queue of background jobs |
| **S3 storage** (MinIO on your machine) | Files: doc images, tenant exports, archives |
| **Mailpit** | A fake inbox. On your machine no email ever leaves; it all lands here, at `localhost:28025` |

> [!TIP]
> **If Redis lost everything**, the cache would simply be rebuilt from Postgres. That is why
> Postgres is the only place that must never lose data. The job queue is the one part of Redis
> that matters: a lost job is work that never happens.

## How a click travels

:::steps
### You press a button

The web page sends a request to the web app.

### The web app checks who you are

It reads your session and works out what you are allowed to do. If you are not allowed, it stops
here and says so.

### The work is done

The web app reads or writes Postgres. If the work is slow, such as sending an email or exporting
a tenant, it puts a job on the queue instead and answers straight away.

### The worker picks up the job

Seconds later the worker runs it, and the stream process tells your browser when something changes.
:::

## Good to know

:::accordion{title="Why are there two names for one Redis?"}
The settings name `REDIS_CACHE_URL` and `REDIS_QUEUE_URL` separately, even though both point at
the same Redis today. The cache can be thrown away and the queue cannot. Keeping two names means
they can be split onto two servers later by changing one setting, with no code change.
:::

:::accordion{title="What is 'lite'?"}
This kit is the smaller sibling of a bigger kit. It keeps every seam of the bigger one, so it can
grow into it, but it runs only the stores a smaller product needs.
:::
