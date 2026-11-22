---
title: Observability
description: Logging: closed event codes, levels, redaction and trace IDs, written as JSON.
---

# Observability

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

Logging. Every log line names an event code from a closed list (for example `queue.job.failed`), and the list decides its level and sampling. Lines are written as JSON to standard output. Secret-looking fields are redacted, and every line of a request carries the same trace ID.

This is diagnostics only. Business facts (who did what) go to the audit log in Postgres, never here.

| | |
|---|---|
| Folder | `packages/observability/` |
| Files | 30 |
| Uses | [Core](core.md), [Errors](errors.md) |
| Used by | [Infrastructure (the real adapters)](infrastructure.md), [Composition (the wiring)](composition.md), [API server](api-server.md), [The web app](app-web.md), [The realtime app](app-realtime.md) |

## Every file

### `packages/observability/`

| File | What it does |
|---|---|
| `package.json` | Package manifest. |
| `tsconfig.json` | TypeScript settings. |
| `tsup.config.ts` | Build settings. |
| `vitest.config.ts` | Test settings. |

### `packages/observability/src/`

| File | What it does |
|---|---|
| `import.ts` | Outside-import surface. |
| `index.ts` | Public entry point. |

### `packages/observability/src/catalog/`

| File | What it does |
|---|---|
| `core.events.ts` | The list of log event codes (for example `queue.job.failed`), each with its level and, for very noisy ones, a sampling rate. The list is short on purpose because each code becomes a label in the log store. |
| `index.ts` | `EVENT_CATALOG` and the `EventCode` type: every log event the system may write, merged from per-area files. The level is decided here, never at the call site. |

### `packages/observability/src/event/`

| File | What it does |
|---|---|
| `event-shape.ts` | The fields each log event code is allowed to carry, as types. A token or password cannot be logged unless someone adds a field for it here, where a reviewer sees it. |
| `index.ts` | Folder barrel: re-exports the event shape types. |

### `packages/observability/src/logger/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `json.logger.ts` | `JsonLogger`: writes one JSON object per line to standard output, or a readable format in a terminal during development. |
| `logger.ts` | `Logger`: the logging interface every server part uses. Each call names an event code; `child()` attaches fields such as the trace ID to every later line; `failure()` logs an error with the severity its error code declares. |
| `redactor.ts` | `Redactor`: replaces the value of any field whose name looks secret (token, password, key, cookie) with `[redacted]` before a line is written. |
| `silent.logger.ts` | `SilentLogger`: a logger that writes nothing, used in tests. |

### `packages/observability/src/primitive/`

| File | What it does |
|---|---|
| `correlation.ts` | `Correlation`: one trace ID per request. It is taken from an incoming `x-request-id` header if there is one, or generated, then attached to every log line and error for that request. |
| `index.ts` | Folder barrel. |
| `log-level.ts` | `LogLevels`: the four log levels (debug, info, warn, error) and how an error's severity maps to one. |

### `packages/observability/tests/catalog/`

| File | What it does |
|---|---|
| `catalog.spec.ts` | Tests the event catalog: every code has a field shape, and failures are never sampled away. |

### `packages/observability/tests/logger/`

| File | What it does |
|---|---|
| `logger.spec.ts` | Tests `logger.ts`. |
| `redactor.spec.ts` | Tests `redactor.ts`. |
| `wire-contract.spec.ts` | Tests that a log line has exactly the shape the log shipper expects, with the four label fields at the top level. |

### `packages/observability/tests/primitive/`

| File | What it does |
|---|---|
| `correlation.spec.ts` | Tests `correlation.ts`. |
| `log-level.spec.ts` | Tests `log-level.ts`. |

### `packages/observability/docs/`

| File | What it does |
|---|---|
| `index.md` | One diagnostic stream — closed event codes, levels decided by a catalog, structured fields as JSON lines to stdout. The other half of the split that keeps errors free of prose. |
| `meta.json` | Sidebar order. |

### `packages/observability/docs/reference/`

| File | What it does |
|---|---|
| `catalog.md` | Why a log line has a code, why the level lives in the catalog rather than the call site, and how sampling becomes a per-code dial. |
| `correlation.md` | One id per request, adopted from upstream where there is one, stamped onto the error envelope so a user can read it back. |
| `logger.md` | The seam, why it returns void rather than a promise, what failure() reads off an AppError, and where the redaction line sits. |
| `meta.json` | Sidebar order. |
