---
title: Env
description: What the stream process reads, the auth settings that must equal the web app's, and why its pool is five.
---

# Env

The schema is the web app's, deliberately, with four differences. The process resolves principals —
a session cookie, a bearer token, an API key — so it carries the whole `AUTH_*` block the worker
does not.

| Key | Here | Why |
| --- | --- | --- |
| `REALTIME_PORT` | `23001` | Where `/api/realtime` is proxied to. The web app's Vite reads it too |
| `REALTIME_SHUTDOWN_TIMEOUT_MS` | `20000` | The stop's budget; half spreads the ends, half is the backstop |
| `DATABASE_POOL_MAX` | `5` | Never a query per frame, and one per tenant each minute rather than per stream. See below |
| `APP` | `realtime` | The log label, so a line says which process wrote it |

**`AUTH_SECRET` and `AUTH_COOKIE_CACHE_MAX_AGE_SECONDS` must equal the web app's.** The cookie
is signed by the web app and read here. A different secret reads every cookie as forged, and every
stream answers `UNAUTHORIZED` — which the browser, correctly, does not retry.

`REALTIME_MAX_STREAMS_PER_USER` and `REALTIME_STREAM_MAX_AGE_SECONDS` are read here and, for one
release, by the web app too: it still mounts the stream router so tabs opened before the deploy keep
working. The cap is per process and counts every stream a person opens.

**Five is sized for the tenants a process holds, not the streams.** One interval a process
revalidates every open stream (`CR.4`, `RV.4`): it groups the streams by tenant and asks per
tenant, on that tenant's shard, serially. A tenant costs one query for who of its members is still
active, whether it holds one stream or a thousand, so a minute is one query per tenant at 10 000
streams or ten. A pass still running when the next minute comes is skipped rather than stacked, so
a slow pool delays revocation instead of growing its queue. The pool only needs raising when one
process holds thousands of tenants at once.

`DATABASE_SHARD_<n>_URL` is read by the same `shardsFromEnv` as every other process, and
`check-architecture` §29 holds the four copies to one algorithm.
