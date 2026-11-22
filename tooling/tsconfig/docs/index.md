---
title: "@loadbearing/tsconfig"
description: One strict base and three presets, published as a workspace package so every tsconfig.json in the repository is four lines long.
---

# `@loadbearing/tsconfig`

One strict base holding every compiler decision and three thin presets differing only in module
resolution and DOM. Every `tsconfig.json` is about four lines, leaving no room for per-package drift.

| | |
| --- | --- |
| **Package** | `@loadbearing/tsconfig` (private, never published) |
| **Files** | `src/base.json`, `src/library.json`, `src/node-esm.json`, `src/react.json` |
| **Build step** | none — JSON, read directly by `tsc` |
| **Dependencies** | none |

---

## The four files

```
tooling/tsconfig/
├── package.json     ← exports map; no `type`, no build
├── docs/
└── src/
    ├── base.json         ES2024, strict + five extra flags, no DOM
    ├── library.json      Bundler resolution, noEmit      → packages/*
    ├── node-esm.json     NodeNext resolution, node types → apps/worker, apps/realtime
    └── react.json        Bundler resolution, DOM, jsx    → apps/web, ui, feature, query
```

Each preset extends `./base.json` (a relative sibling, not via the exports map). No package extends
`base.json` directly; it exists so a new flag is one edit, not three.

| Preset | Module / resolution | `lib` | Emits | Used by |
| --- | --- | --- | --- | --- |
| [`library`](reference/presets.md#libraryjson) | `ESNext` / `Bundler` | ES2024 | no — tsup emits | every non-React `packages/*` |
| [`node-esm`](reference/presets.md#node-esmjson) | `NodeNext` / `NodeNext` | ES2024 | yes — `tsc` is the build | `apps/worker`, `apps/realtime` |
| [`react`](reference/presets.md#reactjson) | `ESNext` / `Bundler` | ES2024 + DOM | no — Vite emits | `apps/web`, `ui`, `feature`, `query` |

---

## How a package consumes it

```json
{
  "extends": "@loadbearing/tsconfig/library.json",
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

and declares the dependency:

```json
"devDependencies": { "@loadbearing/tsconfig": "workspace:*" }
```

That is the whole integration. `apps/web` adds its path alias and Vite client types; the Node apps add
`outDir` and `rootDir`, since there `tsc` emits.

---

## Why this package has an `exports` map but no `type` and no build

```json
{
  "name": "@loadbearing/tsconfig",
  "version": "0.0.0",
  "private": true,
  "exports": {
    "./base.json": "./src/base.json",
    "./library.json": "./src/library.json",
    "./node-esm.json": "./src/node-esm.json",
    "./react.json": "./src/react.json"
  },
  "files": ["src"]
}
```

No `type` and no build — `tsc` reads the JSON directly. **The `exports` map keeps the specifier short:**
presets live in `src/`, but every consumer writes:

```json
{ "extends": "@loadbearing/tsconfig/library.json" }
```

TypeScript honours `exports` for `extends`, so `src/` never leaks into consumers.

> [!IMPORTANT]
> `exports` is an **allowlist**: an unregistered fifth preset fails `extends` with
> `TS6053: File not found`, which reads like a missing file, not a missing entry.

`files: ["src"]` does not affect resolution (a private workspace symlink has every file); it is there in
case that changes.

---

## The one decision that shapes everything else

**`base.json` sets `lib: ["ES2024"]` with no DOM, and only `react.json` adds it back.**

That makes `document.querySelector` in `@loadbearing/application` a **compile error**, not a runtime
crash in the worker. It is also why `ServerOnly.assert()` reads `window` off `globalThis` — a bare
`typeof window` is `TS2304` against `library.json`
([server-only](../../../packages/core/docs/reference/server-only.md#why-the-check-goes-through-globalthis)).

---

## Relationship to the other tooling

TypeScript, Biome and ESLint each own a layer, wired to agree:

| Concern | Owner | Pairs with |
| --- | --- | --- |
| What compiles | this package | — |
| Type-only imports emit nothing | `verbatimModuleSyntax` here | Biome's `useImportType` |
| Imports sorted and pruned | — | Biome's `organizeImports` assist action |
| Type-aware lint rules | `projectService` discovers these files | [eslint-config rules](../../eslint-config/docs/reference/rules.md) |

`verbatimModuleSyntax` makes a type-only import emit nothing; `useImportType` makes it written type-only
— so "`ui` may reference `PermissionKey` without depending on `permissions`" is build-enforced.

> [!TIP]
> Use the workspace TypeScript in your editor (VS Code: *Select TypeScript Version* → **Use Workspace
> Version**), or `verbatimModuleSyntax` and `noUncheckedIndexedAccess` behave differently from
> `pnpm typecheck`.

---

## See also

- [`base`](reference/base.md) — every compiler option and why it is set
- [`presets`](reference/presets.md) — what each preset changes, and which one a package picks
