---
title: Env
description: What the stream process reads, the auth settings that must equal the web app's, and why its pool is five.
---

# Env

The web app's schema with four differences. It resolves principals (cookie, bearer token, API key), so
it carries the whole `AUTH_*` block the worker lacks.

| Key | Here | Why |
| --- | --- | --- |
| `REALTIME_PORT` | `23001` | Where `/api/realtime` is proxied to. The web app's Vite reads it too |
| `REALTIME_SHUTDOWN_TIMEOUT_MS` | `20000` | The stop's budget; half spreads the ends, half is the backstop |
| `DATABASE_POOL_MAX` | `5` | Never a query per frame, and one per tenant each minute rather than per stream. See below |
| `APP` | `realtime` | The log label, so a line says which process wrote it |

**`AUTH_SECRET` and `AUTH_COOKIE_CACHE_MAX_AGE_SECONDS` must equal the web app's** — it signs the
cookie; a different secret makes every stream `UNAUTHORIZED`, which the browser rightly does not retry.
`REALTIME_MAX_STREAMS_PER_USER` and `REALTIME_STREAM_MAX_AGE_SECONDS` are read here (the web app parses
them only because `ContainerConfig.realtime` requires them); the cap holds across processes through stream leases (`26.6`), counting every stream
a person opens.

**Five is sized for tenants held, not streams.** Each minute the process revalidates every open stream
(`CR.4`, `RV.4`), grouped by tenant, per tenant on its shard, serially. A tenant costs one query for who of its members is still
active, whether it holds one stream or a thousand, so a minute is one query per tenant at 10 000
streams or ten. A pass still running at the next minute is skipped, not stacked, so a slow pool
delays revocation rather than queueing. Raise the pool only for thousands of tenants per process.
`DATABASE_SHARD_<n>_URL` goes through the shared `shardsFromEnv` (§29 holds the four copies to one
algorithm).
