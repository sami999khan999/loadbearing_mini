---
title: The realtime app
description: The process that holds every open live stream and forwards events from Redis.
---

# The realtime app

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

A small separate process that holds every open live stream. Browsers connect to `/api/realtime` (the same address as the site; a proxy sends it here), and this process forwards events from Redis to each tab. Keeping streams here means a deploy of the web app does not drop every open connection.

| | |
|---|---|
| Folder | `apps/realtime/` |
| Files | 18 |
| Uses | [API server](api-server.md), [Composition (the wiring)](composition.md), [Application (the business logic)](application.md), [Contracts](contracts.md), [Observability](observability.md) |
| Used by | nothing; it is a top-level program |

## Every file

### `apps/realtime/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsconfig.test.json` | TypeScript settings for type-checking the realtime app's tests. |
| `vitest.config.ts` | Test runner settings for the realtime app, with a complete fake environment. |

### `apps/realtime/src/`

| File | What it does |
|---|---|
| `env.ts` | `Env`: reads and validates the realtime app's environment variables, including the sign-in settings it needs to recognise sessions (they must match the web app's). |
| `import.ts` | Every outside import the realtime app uses, written once. |
| `main.ts` | The realtime app's entry point: reads settings, builds the container, starts listening, and shuts down cleanly. |

### `apps/realtime/src/bootstrap/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `realtime-bootstrap.ts` | `RealtimeBootstrap`: starts the stream listener, and on shutdown stops taking new streams, lets open ones finish, then closes connections. |

### `apps/realtime/src/server/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `stream-listener.ts` | `StreamListener`: the HTTP server for live streams. Serves only `/api/realtime/*` through the same middleware chain as the API, plus a health probe. |

### `apps/realtime/tests/bootstrap/`

| File | What it does |
|---|---|
| `realtime-bootstrap.spec.ts` | Tests `realtime-bootstrap.ts`. |

### `apps/realtime/tests/server/`

| File | What it does |
|---|---|
| `stream-listener.spec.ts` | Tests `stream-listener.ts`. |

### `apps/realtime/docs/`

| File | What it does |
|---|---|
| `index.md` | The stream process. It holds every open browser stream and nothing else, so a thousand open tabs or a reconnect wave after a deploy never slows the web app's pages. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `apps/realtime/docs/reference/`

| File | What it does |
|---|---|
| `env.md` | What the stream process reads, the auth settings that must equal the web app's, and why its pool is five. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `shutdown.md` | Why a stop ends every stream cleanly at a random point in a window, rather than cutting them all at once. |
