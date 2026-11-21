---
title: Env and Endpoint
description: Why the schema parses eagerly, the configs it refuses at boot, why Endpoint is a separate file, and why the auth base URL ends in .invalid.
---

# `Env` and `Endpoint`

## `Env` is server-only, and the marker is what enforces it

`env.ts` opens with Start's server-only marker, so import protection fails the build if the client graph
reaches it — **what no naming convention can guarantee** (before, `Env` shipped to the browser and threw
before first render). A side-effect import cannot be re-exported, hence its own imports. It and each other
app's `env.ts` are the only `process.env` readers.

**Parsed at module load**, so a missing `AUTH_SECRET` crashes boot with a field path, not a 500 an hour later.

## Configs refused at boot

Each refuses at boot a config that would fail later, elsewhere, silently:

- **`bootstrap` with no `BOOTSTRAP_ORGANIZATION_SLUG`** silently enrols nobody. No default slug — unset
  means no enrolment.
- **`EMBEDDING_PROVIDER` other than `none` without `EMBEDDING_API_KEY`** — the first index fails auth
  ([embedding](../../../../packages/infrastructure/docs/reference/embedding.md)).
- **`ASSISTANT_PROVIDER` other than `none`/`fake` without `ASSISTANT_API_KEY`** — the first question fails
  ([assistant](../../../../packages/infrastructure/docs/reference/assistant.md)).
- **An `http` `AUTH_URL` in production** (`FC.15`) — Better Auth marks the cookie `Secure` only over https.
  Loopback (`localhost`, `127.0.0.1`, `[::1]`) is allowed.

`WEB_DATABASE_CONNECTIONS` is read by `cluster.mjs` first; declared here so a bad value fails with a path
(`FC.14`).

## Values whose absence is the decision

| Variable | Absent means |
|---|---|
| `GOOGLE_CLIENT_ID` / `_SECRET` | Google sign-in is off. A half-filled pair would be rejected at Google's consent screen, which no log line here can explain — so the container builds a provider only when both are present |
| `DATABASE_REPLICA_URL` | Every read goes to the primary. Present, reads move onto the standby only while `platform_policy.replica_reads_enabled` is on — see [`docs/scale/read-replica.md`](../../../../docs/scale/read-replica.md) |
| `REDIS_REALTIME_URL` | Live frames share the cache instance — see [`docs/scale/split-redis.md`](../../../../docs/scale/split-redis.md) |

Logs have no variable of their own beyond level and format: they are JSON lines on stdout. Shipping
them somewhere is [`docs/scale/logs.md`](../../../../docs/scale/logs.md).

## Values with a cap rather than a default

- **`AUTH_COOKIE_CACHE_MAX_AGE_SECONDS` is capped** — raising it widens the revoke-to-stop gap
  ([capability-cache](../../../../packages/auth/docs/reference/capability-cache.md)).
- **`AUTH_SECRET` has a length floor** — nowhere else checks.
- **`EMAIL_FROM` has no default** — an unauthorised sender silently bounces or lands in spam.
- **`APP_BASE_URL` ≠ `AUTH_URL`, deliberately** — the worker needs message links without an auth block.
- **`trustedOrigins` has one home** — Better Auth's CSRF (via `containerConfig()`) and CORS read one list.

## `Endpoint` exists because `Env` cannot

Importing `Env` client-side drags the server schema into the bundle, where the parse throws before
hydration. Client code needs **two addresses and no schema**. Both are same-origin, kept in step with the
handler `prefix` and the mounting routes (which repeat the literal, since `createFileRoute()` takes one).

### Both addresses are absolute, and the RPC one was not

`RPCLink` and Better Auth's client call `new URL()` with **no base**, so relative values throw
(`Failed to construct 'URL'` on the browser's first call). `rpc` was relative from the start — no browser
RPC had ever succeeded, unseen because SSR is in-process and suites call the handler. `rpcPath` keeps the
literal; `rpc` and `auth` come from one private `origin()`.

### Why the auth base URL ends in `.invalid`

Better Auth parses `baseURL` **in its constructor**, so during SSR (no `location`) a relative value
blanks the sign-in page. Every `AuthClient` call is a browser event, so on the server it need only parse;
RFC 2606's `.invalid` never resolves, so a stray SSR call fails loudly. The desktop shell supplies its own
absolute URLs via `import.meta.env`.

## `vite build` must not load `.env`

`dev` and `preview` load the root `.env`; **`build` must not** (the missing flag in
`apps/web/package.json` is deliberate). `.env`'s `NODE_ENV=development` makes `@vitejs/plugin-react` emit
`jsxDEV` into production — **500 on every page** (`jsxDEV is not a function`) while `/api/health` answers
200, and every gate green. The build needs no config: `Env` is runtime, `Endpoint` derives from `location`.

## The shard block, and the two rules that make it safe

`DATABASE_SHARD_<n>_URL` names every node after node 0, with an optional
`DATABASE_SHARD_<n>_DIRECT_URL` and `DATABASE_SHARD_<n>_REPLICA_URL` beside each. Absent is one node, which is every deployment until
the split — `DATABASE_URL` is node 0 and also the catalog.

**Two boot rules:** indexes are contiguous from 1 (a gap would misplace every tenant on later nodes), and
there is no `DATABASE_SHARD_0_URL` (a second name for the catalog pool). No range or key config —
`shard_assignments` names each tenant's node, so a node is two variables and a placement decision
([sharding](../../../../packages/infrastructure/docs/reference/sharding.md)).

## The six database variables, and which of them a pooler would see

Lite ships no pooler: `DATABASE_URL` points straight at Postgres. The code is written as if
pgBouncer sat in front in transaction mode, so adding one is config — see
[`docs/scale/pgbouncer.md`](../../../../docs/scale/pgbouncer.md). `DATABASE_DIRECT_URL` is the one
that would go past it, and is what migrations, the seed, `drizzle-kit` and the archive's DDL use; it
defaults to `DATABASE_URL`, which is correct only while nothing is pooling.

`DATABASE_POOL_MAX`, `_IDLE_TIMEOUT_MS` and `_CONNECT_TIMEOUT_MS` size this replica's `pg.Pool`; without a
connect timeout an unreachable Postgres holds requests past every timeout in front. `DATABASE_STATEMENT_TIMEOUT_MS`
deliberately differs from the worker's — 30 s versus 120 s.

**Through a pooler, that variable is not what enforces the timeout.** `pg` sends it as a startup
parameter, pgBouncer drops it, and `SHOW statement_timeout` reads `0`. The baseline migration's role
setting (`0000_lite_baseline.sql`, 30 s) is the floor, and `PgUnitOfWork` raises it per transaction
with `SET LOCAL`. The full mechanism is in [`upstream:docs/infra/reference/pgbouncer.md`](https://github.com/prodicle/loadbearing_tanstack_start_kit/blob/3fafa78c2f42d2d718236d7666429b858199118a/docs/infra/reference/pgbouncer.md).

## The two realtime numbers

`REALTIME_MAX_STREAMS_PER_USER` (8) caps one person's concurrent streams — checked per process first,
then across processes through stream leases (`26.6`,
[realtime](../../../../packages/infrastructure/docs/reference/realtime.md)).
`REALTIME_STREAM_MAX_AGE_SECONDS` (1800) is how long a stream lives before the client reconnects.

The age limit releases unread channels, spread ±10 %; the client reopens within a second and is replayed
— a path every deploy exercises anyway, better run on a schedule than discovered at 3am.

## `SERVER_SHUTDOWN_TIMEOUT` is srvx's, and the container waits it out

On `SIGTERM` srvx (Nitro's Node server) stops accepting, gives in-flight requests
`SERVER_SHUTDOWN_TIMEOUT` seconds (five), then closes — firing no `close` hook and not exiting. So the web
process once disposed nothing (`CR.34`) until the orchestrator killed it; disposing at once would close
pools under finishing requests. `server/container.ts` waits `Env.shutdownGraceMs` (srvx's window plus a
second), then disposes; `dispose` runs every step even if one throws, and closed Redis refuses to reopen.
The schema reads srvx's own variable, so they cannot disagree. Measured on Linux in `CP7.5` (Windows has no
catchable `SIGTERM`).
