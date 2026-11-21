---
title: "@loadbearing/eslint-config"
description: One flat config holding the rules Biome cannot express — the AST-shape assertions that are the architecture, plus the typed rules that need a whole TypeScript program.
---

# `@loadbearing/eslint-config`

Biome formats and does most linting; this package holds what Biome cannot express — one config of
`files`-scoped blocks, not presets.

| | |
| --- | --- |
| **Package** | `@loadbearing/eslint-config` (private, never published) |
| **Entrypoint** | `./src/index.js` via `main`, typed by `./src/types/index.d.ts` |
| **Consumed by** | the workspace root only |
| **Build step** | none — plain ESM, loaded directly |

```
tooling/eslint-config/
├── package.json
├── docs/
└── src/
    ├── index.js            ← one config, four blocks
    └── types/
        └── index.d.ts      ← hand-written; no build to emit it
```

---

## The division of labour

Two linters cost something, so each owns a precise share:

| Concern | Owner | Why |
| --- | --- | --- |
| Formatting, import organisation | **Biome** | one binary, ~10× faster, no plugin |
| Most lint rules | **Biome** | runs on save and in the pre-commit hook |
| Whole-module import bans | **Biome** | `noRestrictedImports` with exact paths |
| Parameter properties **required** | **ESLint** | Biome's rule bans them — the opposite direction |
| No exported free functions / no static mutable state | **ESLint** | AST-shape selectors; Biome has no equivalent |
| Typed rules (`no-floating-promises`) | **ESLint** | needs a whole TypeScript program |
| Bans needing named-export or type-import nuance | **ESLint** | Biome cannot exempt either |

> [!IMPORTANT]
> **A rule in both tools belongs to Biome** — `no-explicit-any`, `no-unused-vars` and
> `consistent-type-imports` are `"off"` here, since duplicate diagnostics teach people to ignore both.

Biome runs on save and commit; ESLint on pre-push and CI — keeping the pre-commit hook under a second, and
a hook that runs beats a thorough one that gets disabled.

---

## How it is consumed

**`eslint.config.js`** at the workspace root — the only consumer:

```js
export { default } from "@loadbearing/eslint-config";
```

```json
"devDependencies": { "@loadbearing/eslint-config": "workspace:*" }
```

**No package has a lint config or lint script** — both linters run once from the root on globs, so no
package can opt out of a rule meant to constrain it.

> [!NOTE]
> ESLint 9 resolves flat config from the **working directory**, ignoring nearer configs — a per-package
> footgun (a missing config silently inherits weaker root rules). With one root config it cannot bite.

---

## Dependency layout

```json
{
  "dependencies": { "typescript-eslint": "catalog:" },
  "devDependencies": { "eslint": "catalog:" }
}
```

**Declare what you import:** `typescript-eslint` is imported at runtime (a dependency); `eslint` is the
host, so a devDependency — for the `Linter` type and a deterministic `typescript-eslint` peer.

> [!CAUTION]
> **This package supplies no `eslint` binary** — pnpm links executables only from *direct* dependencies,
> and there is no `bin`. `eslint .` works via the **root** `eslint` devDependency (the root `.bin` is on
> every script's `PATH`); do not remove it. The catalog pins one version, so both resolve to one copy.

---

## `src/types/index.d.ts`

Hand-written, because there is no build step to emit one:

```ts
import type { Linter } from "eslint";

declare const config: Linter.Config[];

export default config;
```

Without it the root config reports `TS7016: Could not find a declaration file`. It is itself ignored —
`**/*.d.ts` is in no tsconfig `include`, so typed rules would fail with a parsing error.

---

## See also

- [Rules](reference/rules.md) — every block in the config and why it is there
- [`@loadbearing/tsconfig`](../../tsconfig/docs/index.md) — `verbatimModuleSyntax` pairs with
  Biome's `useImportType` the way it used to pair with `consistent-type-imports`
