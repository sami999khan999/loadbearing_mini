---
title: base.json
description: Every compiler option in the shared base, grouped by what it does — and the five that carry real architectural weight.
---

# `base.json`

Never extended directly; it holds every compiler decision so the three [presets](presets.md) share one copy.

```json
{
  "compilerOptions": {
    "target": "ES2024",
    "lib": ["ES2024"],

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "exactOptionalPropertyTypes": false,

    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",

    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

**Absent:** `module`/`moduleResolution` (the presets' one disagreement), and **anything relative** — no
`exclude`, `files`, `include`, `tsBuildInfoFile`. Relative paths resolve against this file, so an `exclude`
here silently replaced TypeScript's default with a no-op in every package (`incremental` went for the same
reason). Verify with `tsc --showConfig` inside any package.

---

## The five that do real work

### `verbatimModuleSyntax`

The most consequential flag: `import type` for type-only imports, and imports emitted **exactly as
written**. That makes type-only imports an architectural tool:

```ts
// packages/ui/src/component/can/can.tsx
import type { CapabilitySet, PermissionKey } from "@loadbearing/permissions";
```

It emits nothing, so `ui` names the permission vocabulary with **zero runtime dependency** (the instance
is a prop), and `content` names `ImageKey` without pulling `asset`'s binaries into the worker. Biome's
`useImportType` makes the other spelling an error.

### `noImplicitOverride`

Requires `override` on every redefinition. The codebase is abstract classes — `Clock`, `Result`, and every
`application` port (`VectorStore`, `StorageGateway`, `CacheStore`, `QueuePublisher`, `UnitOfWork`,
`DomainEventPublisher`, `ActivityLogger`, `EmbeddingProvider`, …) — so renaming a base method fails in each
subclass instead of silently leaving orphan methods.

> [!NOTE]
> Only where an implementation `extends` its port. `extends BaseRepository implements SomePort` adapters
> forfeit it — `implements` members are not overrides.

### `noUncheckedIndexedAccess`

`record[key]` is `T | undefined` — why `ProcedurePermissions.required(path)` honestly returns
`PermissionKey | undefined`, making the middleware's fail-closed check natural. The `!` in provably
in-range loops (`bytes[6]!` in `Uuid.v7()`) is the intended, sparing escape.

### `forceConsistentCasingInFileNames`

macOS and Windows are case-insensitive, Linux CI is not: `import "./TaskEntity.js"` for `task.entity.ts`
would pass locally and fail in CI as a missing file.

### `isolatedModules`

Matches tsup/esbuild's file-by-file transpile, rejecting what they would mistranslate — so a passing
`tsc --noEmit` is evidence `tsup` output is correct.

---

## `target: "ES2024"`

For the **runtime**: Node 24 (V8 13.6) has all of ES2024 (`Object.groupBy`, `Promise.withResolvers`,
`toSorted`, RegExp `v`), so no helpers. Vite's `build.target` governs what ships to browsers. Keep it
aligned with each `tsup.config.ts` `target` — a stale `es2023` is harmless but wasteful. `lib: ["ES2024"]`
with **no DOM** makes browser globals a compile error outside React packages
([overview](../index.md#the-one-decision-that-shapes-everything-else)).

---

## The rest, briefly

| Option | Why |
| --- | --- |
| `strict` | the baseline everything else assumes |
| `noFallthroughCasesInSwitch` | discriminated-union switches; a fallthrough is silent |
| `useUnknownInCatchVariables` | caught values are `unknown`, matched on `code`, not `instanceof` |
| `esModuleInterop` | a few CJS-only transitive dependencies |
| `skipLibCheck` | large build saving; third-party type errors are not yours |
| `resolveJsonModule` | import JSON directly |
| `moduleDetection: "force"` | no file becomes a global script |
| `declaration` + `declarationMap` | *Go to Definition* across packages lands in `src/` |
| `sourceMap` | stack traces point at TypeScript |

---

## `exactOptionalPropertyTypes` is off, deliberately

More correct (absent vs present-and-`undefined`), but it fights Zod's `.optional()` output at every
boundary. Revisit if it would have caught a real bug; enabling later is mechanical but wide.

---

## See also

- [`presets`](presets.md) — what `library`, `node-esm`, and `react` add on top
- [Overview](../index.md) — how packages consume this and how it pairs with the linters
