---
title: Tooling
description: Shared TypeScript, Biome and ESLint settings, and the repository's own check scripts.
---

# Tooling

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

`tooling/` holds four small workspace packages that never ship to users. They exist so every package is checked the same way.

- `tsconfig` is the strict TypeScript base and three presets (library, Node, React). Every package's `tsconfig.json` is four lines that extend one of them.
- `biome-config` is the formatter and fast linter, including the rule that stops browser packages importing server code.
- `eslint-config` holds the rules Biome cannot express, such as "no exported free functions" and "explicit member visibility".
- `scripts` holds the repository's own checks (`check-architecture.mjs` and friends), the boot and smoke helpers, and the command that publishes `docs/explained/` into a running app.

This page covers 81 files.

## Every file

### `tooling/biome-config/`

| File | What it does |
|---|---|
| `package.json` | Manifest for `@loadbearing/biome-config`, the shared Biome settings. |

### `tooling/biome-config/docs/`

| File | What it does |
|---|---|
| `index.md` | The Biome configuration — formatting, import organisation, and the fast lint rules. One base file the root extends, replacing Prettier entirely. |
| `meta.json` | Sidebar order. |

### `tooling/biome-config/docs/reference/`

| File | What it does |
|---|---|
| `boundary.md` | The server-only import boundary — the three overrides blocks that keep database code out of the browser, and the two ways this config can fail silently. |
| `meta.json` | Sidebar order. |

### `tooling/biome-config/src/`

| File | What it does |
|---|---|
| `base.json` | The Biome settings: formatting (replacing Prettier), import sorting, fast lint rules, and the server-only boundary that makes it an error for browser-side packages to import database or auth code. |

### `tooling/eslint-config/`

| File | What it does |
|---|---|
| `package.json` | Manifest for `@loadbearing/eslint-config`, the shared ESLint settings. |

### `tooling/eslint-config/docs/`

| File | What it does |
|---|---|
| `index.md` | One flat config holding the rules Biome cannot express — the AST-shape assertions that are the architecture, plus the typed rules that need a whole TypeScript program. |
| `meta.json` | Sidebar order. |

### `tooling/eslint-config/docs/reference/`

| File | What it does |
|---|---|
| `meta.json` | Sidebar order. |
| `rules.md` | The blocks in the config — ignores, typed rules, the OOP shape assertions, the two bans that need type-import nuance, and the lazy() ban. |

### `tooling/eslint-config/src/`

| File | What it does |
|---|---|
| `index.js` | The ESLint rules Biome cannot express: type-aware rules, the class-shape rules (no exported free functions, explicit member visibility, no static mutable state), banned imports per layer, and the ban on lazy-loading by permission. |

### `tooling/eslint-config/src/types/`

| File | What it does |
|---|---|
| `index.d.ts` | Hand-written type declaration for the ESLint config, because this package has no build step. |

### `tooling/scripts/`

| File | What it does |
|---|---|
| `bench.mjs` | `pnpm bench`: measures requests per second and response times for the app's main pages against a running server. |
| `boot-app.mjs` | Starts a built app on a free port and waits until its own output says it is listening. Shared by the boot check and the web smoke tests. |
| `boot-smoke.mjs` | Starts each built app (web, worker, realtime) once, waits until it says it is up, then stops it. Catches a missing setting that only fails at start-up, which tests run against source never see. |
| `check-architecture.mjs` | `pnpm check:architecture`: about thirty checks that type-checking, linting and tests do not catch. Examples: the business layer importing a framework or logging, `process.env` read outside `env.ts`, block comments, server code in the browser bundle, a table missing its tenant column, a docs path that names a missing file, a colour that is not one of the twelve theme colours. |
| `check-contrast.mjs` | `pnpm check:contrast`: checks that every text and background colour pair in every theme, light and dark, is readable (WCAG AA) and stays inside the sRGB colour range. |
| `comment-density.mjs` | `pnpm check:comments`: reports how much of each package is comments and how many comment blocks run past two lines. Reports only; never fails. |
| `compose-wait.mjs` | Waits until every container in the Docker stack is healthy, treating the one-shot bucket setup container finishing as success. |
| `compose.mjs` | The one place `docker compose` is called, so the containers read the same root `.env` the apps do. |
| `docs-publish.mjs` | `pnpm docs:publish`: publishes every docs tree in the repository into a running app's docs, one space per area: the overview, this guide, the AI rulebook, the opinions, the scale-up guide, the infrastructure, the packages, the apps, the tooling and the plans. It signs in, creates or updates each space, then creates, reorders, saves and publishes only the pages that changed, and finally reads every page back to check it is live and that every link between pages lands. `--space` publishes one area, `--audience` sets who may read them, `--prune` removes pages the trees no longer have, and `--dry-run` prints the whole tree without sending anything. |
| `docs-tree.mjs` | Reads the docs trees into those spaces, in `meta.json` order, refusing a page that `meta.json` leaves out or names but cannot find. Rewrites each link to another docs page into that page's route, and a link to any other file into its address on the git origin. No network, so it is unit-tested. |
| `package.json` | Manifest for the repository's own scripts, so they are type-checked and tested like any package. |
| `source-text.mjs` | Small text parsers the architecture check is built from: finding imports, stripping comments, reading SQL columns and indexes, skipping fenced code in Markdown. Pure functions, so they are unit-tested. |
| `tsconfig.json` | TypeScript settings that type-check the `.mjs` scripts and their tests as JavaScript. |
| `vitest.config.ts` | Test runner settings for the scripts, with a longer timeout because each architecture-check test spawns the script over a temporary file tree. |

### `tooling/scripts/docs/`

| File | What it does |
|---|---|
| `index.md` | What the scripts in this folder are, and every place the small kit's architecture check differs from the big kit's. |
| `meta.json` | Sidebar order. |


### `tooling/scripts/tests/`

| File | What it does |
|---|---|
| `check-architecture.spec.mjs` | Tests every architecture check twice: once against a temporary file tree that breaks the rule, once against one that obeys it. |
| `compose-wait.spec.mjs` | Tests how the wait script reads each container state Docker can report. |
| `compose.spec.mjs` | Tests that the compose wrapper passes the root `.env` to Docker. |
| `docs-tree.spec.mjs` | Tests the docs reader on a temporary file tree: the page order, sections adding no URL segment, refused pages, generated overview pages, and which links are rewritten and which are left as written. |
| `source-text.spec.mjs` | Tests the text parsers against inputs that once fooled them, such as `//` inside a string. |

### `tooling/tsconfig/`

| File | What it does |
|---|---|
| `package.json` | Manifest for `@loadbearing/tsconfig`, the shared TypeScript presets. It exposes the four JSON files under `src/`. |

### `tooling/tsconfig/docs/`

| File | What it does |
|---|---|
| `index.md` | One strict base and three presets, published as a workspace package so every tsconfig.json in the repository is four lines long. |
| `meta.json` | Sidebar order. |

### `tooling/tsconfig/docs/reference/`

| File | What it does |
|---|---|
| `base.md` | Every compiler option in the shared base, grouped by what it does — and the five that carry real architectural weight. |
| `meta.json` | Sidebar order. |
| `presets.md` | The three thin presets — library, node-esm, react — what each changes and which packages pick it. |

### `tooling/tsconfig/src/`

| File | What it does |
|---|---|
| `base.json` | The strict TypeScript settings every package inherits: ES2024, strict mode, unchecked index access treated as possibly undefined, and the rest. |
| `library.json` | Preset for packages bundled by tsup: base settings plus bundler-style module resolution, no output from `tsc`. |
| `node-esm.json` | Preset for code Node runs directly (the worker, the realtime app, scripts): Node's own ES module resolution and Node types. |
| `react.json` | Preset for React packages: base settings plus browser types and JSX. |
