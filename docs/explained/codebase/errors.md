---
title: Errors
description: One error shape for the whole system: a code and details, never a sentence.
---

# Errors

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The one shape every failure takes, everywhere. An `AppError` carries a code (such as `FORBIDDEN`) and structured details, never a sentence: the words a user reads come from `content`, in their language.

Anything thrown anywhere passes through `ErrorNormalizer` before it is logged, sent or shown, so a database error string can never reach a browser. The catalog says, for each code, whether it is expected (someone tried something not allowed) or a bug, and whether retrying could help.

| | |
|---|---|
| Folder | `packages/errors/` |
| Files | 35 |
| Uses | nothing else in the workspace |
| Used by | [Core](core.md), [Observability](observability.md), [Contracts](contracts.md), [Content](content.md), [Application (the business logic)](application.md), [Infrastructure (the real adapters)](infrastructure.md), [Composition (the wiring)](composition.md), [API server](api-server.md), [API client](api-client.md), [Query (data fetching and caching)](query.md), [Feature (the screens' building blocks)](feature.md), [The web app](app-web.md) |

## Every file

### `packages/errors/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/errors/src/`

| File | What it does |
|---|---|
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/errors/src/catalog/`

| File | What it does |
|---|---|
| `core.errors.ts` | The error codes the core layer owns, such as `SERVER_ONLY`, each with its severity and whether retrying could help. |
| `index.ts` | `ERROR_CATALOG` and the `ErrorCode` type: the closed list of every error code in the system, merged from per-area files. Each entry says whether the error is expected (a user tried something not allowed) or unexpected (a bug), and whether it is retryable. |

### `packages/errors/src/error/`

| File | What it does |
|---|---|
| `account-suspended.error.ts` | `AccountSuspendedError`: the platform has locked this account. Only shown after the password was correct, so it never reveals whether an address has an account. |
| `app.error.ts` | `AppError`, the base of every error the app throws. Its message is the error code, never a sentence; the words a user reads come from the `content` package. It turns into a JSON envelope to cross the network and can be rebuilt from one. Also `TransportError` for network failures. |
| `conflict.error.ts` | `ConflictError`: the thing changed since you read it, or the value must be unique and is already taken. |
| `forbidden.error.ts` | `ForbiddenError`: you are signed in but not allowed to do this. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `internal.error.ts` | `InternalError`: what any unrecognised failure becomes. The original error is kept for the logs but never sent to the browser. |
| `not-found.error.ts` | `NotFoundError`: the thing does not exist, or you are not allowed to know it exists. |
| `rate-limited.error.ts` | `RateLimitedError`: too many requests to this endpoint; try again later. |
| `server-only.error.ts` | `ServerOnlyError`: server-only code was loaded in a browser. Always a build bug, never a user action. |
| `two-factor-required.error.ts` | `TwoFactorRequiredError`: the password was right and a second-factor code is needed next. The sign-in form branches on it. |
| `unauthorized.error.ts` | `UnauthorizedError`: you are not signed in. |
| `unavailable.error.ts` | `UnavailableError`: something the app depends on (database, AI provider) failed. Marked retryable, so a background job tries again rather than giving up. |
| `validation.error.ts` | `ValidationError`: input failed its schema. Turns Zod's issues into `{ field, rule, params }` so the `content` package can write the sentence in the user's language. |

### `packages/errors/src/normalizer/`

| File | What it does |
|---|---|
| `error-normalizer.ts` | `ErrorNormalizer`: the one gate every thrown value passes before it is logged, sent or shown. Whatever was thrown (a string, a database error, `undefined`), the result is a known `AppError`, and internal details such as table names never reach the browser. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/errors/src/transport/`

| File | What it does |
|---|---|
| `http.ts` | `HTTP_STATUS`: which HTTP status code each error code maps to. The only file in the package that knows HTTP exists; the business layer may not import it. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `trace-id.ts` | `TraceIds`: checks a trace ID arriving from the network (length and allowed characters) before it is attached to logs and errors. |

### `packages/errors/tests/error/`

| File | What it does |
|---|---|
| `app.error.spec.ts` | Tests `app.error.ts`. |
| `server-only.error.spec.ts` | Tests `server-only.error.ts`. |
| `validation.error.spec.ts` | Tests `validation.error.ts`. |

### `packages/errors/tests/normalizer/`

| File | What it does |
|---|---|
| `error-normalizer.spec.ts` | Tests `error-normalizer.ts`: any thrown value comes out as a known shape, and database error text never reaches the envelope. |

### `packages/errors/docs/`

| File | What it does |
|---|---|
| `index.md` | One failure shape every runtime throws, serialises and reconstructs — carrying structured context and no prose, because content owns every word a user reads. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/errors/docs/reference/`

| File | What it does |
|---|---|
| `app-error.md` | AppError — why the message is the code, how the envelope round-trips, and why from() can return null. |
| `catalog.md` | ERROR_CATALOG and HTTP_STATUS — a closed code union, why the metadata is transport-agnostic, and why the status map is quarantined from the domain layer. |
| `error-normalizer.md` | ErrorNormalizer — why detection is structural rather than instanceof, and how the original error is kept for logs while staying out of the envelope. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
