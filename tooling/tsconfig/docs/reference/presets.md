---
title: presets
description: The three thin presets — library, node-esm, react — what each changes and which packages pick it.
---

# Presets

Each extends [`base.json`](base.md), changing only module resolution, whether `tsc` emits, and DOM.

---

## `library.json`

For every non-React `packages/*`.

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true
  }
}
```

- **`noEmit: true`** — tsup emits; `tsc` only typechecks, so `pnpm typecheck` produces no artefacts.
- **`moduleResolution: "Bundler"`** — every consumer is a bundler (Vite, tsup, tsx). It understands
  `exports` including the `development` condition, so Vite resolves `@loadbearing/core` to
  `src/index.ts` and hot-reloads package edits without a rebuild.

---

## `node-esm.json`

For `apps/worker`, `apps/realtime`, and scripts run directly by Node.

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  }
}
```

**`NodeNext` is Node's ESM resolver**, so relative imports need `.js` though the file is `.ts`:

```ts
import { Container } from "./container.js";
```

> [!IMPORTANT]
> Write `.js` **everywhere**, including `packages/*` where `Bundler` does not need it, so files move
> between a package and a Node app without an edit.

- **`types: ["node"]`** — `@types/node` must track the `.nvmrc` runtime major, or APIs typecheck and
  then throw.
- **No `noEmit`** — here `tsc` is the build (`tsc -p tsconfig.json`, plain ESM); the app's tsconfig adds
  `outDir` and `rootDir`.

> [!NOTE]
> No `node-cjs.json`: nothing is CommonJS (oRPC and TanStack Start are ESM, every package is
> `type: "module"`), avoiding the dual-package hazard.

### Why the worker uses `tsx` and not Node's native TypeScript support

Node 24 **strips** types and rejects constructs emitting runtime code — enums, namespaces, decorators,
and decisively constructor parameter properties:

```ts
constructor(private readonly clock: Clock) {}
```

— *mandated* by [`parameter-properties`](../../../eslint-config/docs/reference/rules.md), so stripping
would reject the first file. `tsx` transpiles.

---

## `react.json`

For `apps/web`, `packages/ui`, `packages/feature`, and `packages/query`.

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "types": ["vite/client"]
  }
}
```

- **`lib` adds DOM back** — the only preset that does, so browser globals are a compile error elsewhere
  ([overview](../index.md#the-one-decision-that-shapes-everything-else)).
- **`jsx: "react-jsx"`** — the automatic runtime, no `import React`.
- **`types: ["vite/client"]`** — `import.meta.env` and asset-import types.

> [!TIP]
> `packages/asset` uses `library.json` (React-free, so `content` and `apps/worker` can import it) and so
> declares `*.svg`, `*.webp`, `*.png` in its own `asset.d.ts`.

---

## Picking a preset

| If the package… | Use | Because |
| --- | --- | --- |
| ships React components or hooks | `react` | needs DOM and JSX |
| is a `packages/*` library, no React | `library` | tsup emits, bundler resolves |
| is a Node process with no bundler | `node-esm` | `tsc` emits, Node resolves |

The surprise: **`packages/query` uses `react`** (a provider and hooks), while neighbouring `api-client`
uses `library`, being React-free — which is also why `api-client` is in the ESLint OOP glob and `query`
is not.

---

## See also

- [`base`](base.md) — every option the presets inherit
- [Overview](../index.md) — how packages consume these and how they pair with the linters
