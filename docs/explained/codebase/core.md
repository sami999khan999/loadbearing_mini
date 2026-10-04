---
title: Core
description: Tiny shared building blocks: clock, Result, IDs, tokens, and the server-only tripwire.
---

# Core

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

Four tiny building blocks every other package may use: a clock you can control in tests, a `Result` type for "success or a reason", time-ordered IDs, unguessable tokens, and a tripwire that throws if server code is ever loaded in a browser. It depends on nothing but `errors`.

| | |
|---|---|
| Folder | `packages/core/` |
| Files | 25 |
| Uses | [Errors](errors.md) |
| Used by | [Observability](observability.md), [Contracts](contracts.md), [Application (the business logic)](application.md), [Infrastructure (the real adapters)](infrastructure.md), [Auth](auth.md), [Composition (the wiring)](composition.md) |

## Every file

### `packages/core/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/core/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/core/src/primitive/`

| File | What it does |
|---|---|
| `clock.ts` | `Clock` (the current time, as something passed in rather than read globally), `SystemClock` (the real time) and `FixedClock` (a frozen time for tests). Every time-based rule reads time through this, so tests can control it. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `result.ts` | `Result`, `Ok`, `Err` and `Results`: a way to return "success with a value" or "failure with a reason" without throwing, for failures the caller is expected to handle. |
| `server-only.ts` | `ServerOnly.assert()`: called at the top of every server-only package. If that code ever loads in a browser, it throws straight away instead of leaking database or credential code. |
| `token.ts` | `Token`: makes an unguessable random string (for invitation links, API keys) and its digest. Only the digest is stored, so a database dump holds no usable credential. |
| `uuid.ts` | `Uuid`: generates time-ordered IDs (UUIDv7) for every row, and checks that an untrusted string has the shape of an ID. |

### `packages/core/tests/primitive/`

| File | What it does |
|---|---|
| `clock.spec.ts` | Tests `clock.ts`. |
| `result.spec.ts` | Tests `result.ts`. |
| `server-only.spec.ts` | Tests `server-only.ts`: it throws in a browser-like environment, and the error carries a code, never a sentence. |
| `token.spec.ts` | Tests `token.ts`. |
| `uuid.spec.ts` | Tests `uuid.ts`. |

### `packages/core/docs/`

| File | What it does |
|---|---|
| `index.md` | Four primitives every other package may need and no feature owns — Clock, Result, Uuid, ServerOnly. One dependency, and it is a leaf. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/core/docs/reference/`

| File | What it does |
|---|---|
| `clock.md` | Clock, SystemClock and FixedClock — why time is an injected dependency, and the one rule that makes every time-dependent business rule synchronously testable. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `result.md` | Result, Ok, Err and Results — a discriminated union that narrows in every position, and the decision table for when a failure is a return value and when it is a thrown domain error. |
| `server-only.md` | ServerOnly.assert — the runtime tripwire that catches database or credential code reaching a client bundle, the ServerOnlyError it throws, and the two other defences it sits between. |
| `token.md` | Token — an opaque random string and the digest of one, in core because both application and infrastructure need it and neither can reach auth. |
| `uuid.md` | UUIDv7 generation and validation — why time-ordered keys beat random ones, what they leak, and why crypto is not a global this package can see. |
