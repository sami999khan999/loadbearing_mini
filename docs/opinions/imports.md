---
title: Imports and exports
description: index.ts is what a package gives, import.ts is what it takes. Barrels name every export; export * is banned.
---

# Imports and exports

## One public entrypoint: `src/index.ts`

It re-exports and holds no logic. The `exports` map points at it alone — no deep subpaths, so no
consumer reaches internals and breaks when a file moves. The only extra exports are non-JS
side-effect files that cannot live in a barrel: `@loadbearing/asset`'s `./font.css` and
`./sprite.svg`, `@loadbearing/ui`'s `./style.css`. **A package wanting extra JavaScript subpaths
wants to be two packages.**

## Barrels name every export. `export *` is banned

```ts
// packages/core/src/primitive/index.ts
export { Clock, FixedClock, SystemClock } from "./clock.js";
export { Err, Ok, type Result, Results } from "./result.js";
export { ServerOnly } from "./server-only.js";
export { Uuid } from "./uuid.js";
```

Enforced by Biome's `performance/noReExportAll` at `error`. Four reasons:

1. **A star makes the public API an accident.** Adding `export` anywhere silently publishes to every
   consumer, and the reviewer of `clock.ts` cannot see the surface grow. A named list makes widening a
   second, deliberate, reviewable edit.
2. **It gives a private layer.** `capability-set.ts` can export a helper `permission-registry.ts`
   imports directly while the barrel never names it.
3. **Collisions fail silently.** Two starred files exporting one name make ESM drop it from the
   namespace, surfacing downstream as `undefined`. A named list errors at the barrel line.
4. **`verbatimModuleSyntax` needs it.** `export { Err, Ok, type Result, Results }` marks types inline;
   a star cannot.

**Ordering is Biome's:** `biome check --write` sorts statements by specifier and names alphabetically,
ignoring `type`.

**One exemption: `packages/infrastructure/src/pg/schema/index.ts`**, so `drizzle-kit` and
`drizzle(pool, { schema })` receive every table, relation and enum; it is not an entrypoint, so
enumeration buys nothing. The rule is off for that path only. The namespace re-export is two
statements, since `export * as schema` is a star too:

```ts
// packages/infrastructure/src/pg/index.ts
import * as schema from "./schema/index.js";

export { schema };
```

**Code-splitting internals is not widening the API.** `packages/content` reaches per-namespace
catalogs by dynamic `import()` inside the package; the bundler emits chunks, and the surface is still
one barrel.

## Three import rules, in priority order

1. **Across packages** — the package name, through `import.ts`:
   `export { TaskEntity } from "@loadbearing/contracts"`.
2. **Across folders** — the folder barrel: `import { Locales } from "../primitive/index.js"`.
3. **Within a folder** — the direct file: `import { AppError } from "./app.error.js"`.

**Rule 3 is not style.** Importing a sibling through your own barrel is the standard way to make a
cycle, and it fails as a runtime `undefined` at module init. **Rule 2 yields to rule 3 when a barrel
would close a loop**, and the line says why:

```ts
// packages/permissions/src/capability/capability-set.ts
// The direct file, not `../registry/index.js`: that barrel also loads
// `module-registry.ts`, which imports this folder back. Type-only today, so the
// barrel would work — but this import is what would break the day it is not.
import { type PermissionKey, PermissionRegistry } from "../registry/permission-registry.js";
```

An unexplained deep import reads as carelessness.

## One outside surface: `src/import.ts`

**Every import from another workspace package or npm is written once here and re-exported; the rest
of `src/` imports `./import.js`.**

```ts
// packages/content/src/import.ts
// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export type { ErrorCode, ErrorEnvelope, FieldViolation } from "@loadbearing/errors";
```

```ts
// packages/content/src/message/error-copy.ts
import type { ErrorCode, ErrorEnvelope, FieldViolation } from "../import.js";
```

One file answers "what does this package use?", with no drift from `package.json`. Group specifiers
under a separator per source, workspace packages before npm.

> [!WARNING]
> **`import.ts` re-exports external modules only, never a relative one.** With no edge back into the
> package it cannot join a cycle. Re-export `./translator.js` once and you rebuild the barrel cycle
> rule 3 prevents.

- **It governs `src/`, not `tests/`.** A spec imports its subject relatively and its harness
  (`vitest`, `zod`, an `oc` fixture) directly — otherwise the runner lands in the shipped list.
- **No `import.ts` means no outside dependency** — `@loadbearing/errors` and
  `@loadbearing/permissions` have none. Never commit an empty one.
- **`no-restricted-imports` in `tooling/eslint-config` matches specifiers**, so it fires on
  `import.ts` alone — e.g. the ban on `application` importing `HTTP_STATUS` is checked at the one
  line that could introduce it.

### Apps have one too, and `apps/web` has two

The rule is about a `src/` tree. `apps/worker/src/import.ts` replaced `@loadbearing/composition`
imported in ten files and `bullmq` in nine.

**`apps/web` splits its surface on the server-only boundary.** `src/import.ts` is client-safe;
`src/server/import.ts` is the only one that may name `@loadbearing/composition` and what is beneath
it (`apps/web/src/**` is banned from those, `apps/web/src/server/**` exempt). One surface would give
every route component an edge into the server graph and leave bundle cleanliness to tree-shaking. A
server-only package appearing on the first file *is* the leak.

**Three exemptions, each forced by tooling and commented at the line** (an unexplained one gets
deleted):

| Exemption | Why |
|---|---|
| `apps/*/src/env.ts` keeps its own imports | It carries `import "@tanstack/react-start/server-only"`, and a side-effect import cannot be re-exported. Same rule in both apps. |
| `@tanstack/react-router` is direct inside `apps/web/src/route/**` | The route generator only sees import declarations with that literal specifier; import `createFileRoute` from a surface and it **prepends its own** — a duplicate binding on every generation. |
| `@tanstack/react-start` and `/server` are direct in `apps/web/src/server/*.fn.ts` | A server function's stub ships to the browser, so a re-exported `/server` entry is a live client-graph edge and Start's import protection fails the build. |

That is why the two `*.fn.ts` files read `~/import.ts`, not the server surface beside them: their
graph is genuinely both, and `container.js` reaches them as a relative import inside the handler,
which the compiler removes.

## `.js` extensions on every relative import

`moduleResolution: "Bundler"` does not need them; `NodeNext` in `apps/worker` does. Writing them
everywhere lets code move between the two without an edit.
