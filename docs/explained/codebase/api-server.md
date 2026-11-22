---
title: API server
description: The middleware chain every API call passes through, and the live-stream router.
---

# API server

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The server half of the API transport, shared by the web app and the realtime app. It holds the middleware chain every call passes through (trace ID, principal, rate limit, database placement, error handling) and the live-stream router. The HTTP servers themselves stay in the apps.

| | |
|---|---|
| Folder | `packages/api-server/` |
| Files | 19 |
| Uses | [Application (the business logic)](application.md), [Composition (the wiring)](composition.md), [Contracts](contracts.md), [Errors](errors.md), [Observability](observability.md), [Permissions](permissions.md) |
| Used by | [The web app](app-web.md), [The realtime app](app-realtime.md) |

## Every file

### `packages/api-server/`

| File | What it does |
|---|---|
| `package.json` | Package manifest. |
| `tsconfig.json` | TypeScript settings. |
| `tsup.config.ts` | Build settings. |
| `vitest.config.ts` | Test settings. |

### `packages/api-server/src/`

| File | What it does |
|---|---|
| `import.ts` | Outside-import surface. |
| `index.ts` | Public entry point. |

### `packages/api-server/src/router/`

| File | What it does |
|---|---|
| `base.ts` | The middleware chain every API call passes through, in order: attach a trace ID, build the principal from the request, apply rate limits, place the request on the organization's database node, and turn any error into the standard error envelope. `authed` is the chain endpoints are built on. |
| `error.interceptor.ts` | `ErrorInterceptor`: the one place every server error passes: it is normalised, logged at its severity, and sent to the browser as an error code envelope with the trace ID (never a stack or database text). |
| `index.ts` | Folder barrel. |
| `rate-limit.policy.ts` | `RateLimitPolicy`: the per-endpoint limits for calls that cost something (sending or resending an invitation email, a paid AI search, rendering a big doc preview). |
| `realtime.router.ts` | `RealtimeRouter`: the live-stream endpoint (one stream per signed-in tab). Streams events from Redis to the browser and tells the client how long to wait before reconnecting. |
| `stream-revalidation.ts` | `StreamRevalidation`: an open live stream re-checks every minute that the person may still hold it, and ends it if not. A database blip keeps the stream open. |

### `packages/api-server/tests/router/`

| File | What it does |
|---|---|
| `error.interceptor.spec.ts` | Tests `error.interceptor.ts`. |
| `rate-limit.spec.ts` | Tests the rate limits apply to the right endpoints and no others. |
| `stream-revalidation.spec.ts` | Tests `stream-revalidation.ts`. |

### `packages/api-server/docs/`

| File | What it does |
|---|---|
| `index.md` | The router half of the transport — the authed middleware chain, the error interceptor and the stream router — shared by every app that serves procedures. |
| `meta.json` | Sidebar order. |

### `packages/api-server/docs/reference/`

| File | What it does |
|---|---|
| `meta.json` | Sidebar order. |
| `router.md` | The authed chain's order, why a stream is wrapped once for the shard scope and once for errors, and why every stream lives under one namespace. |
