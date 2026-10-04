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
- `scripts` holds the repository's own checks (`check-architecture.mjs` and friends), the boot and smoke helpers, and the super admin guide with the command that publishes it.

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
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `tooling/biome-config/docs/reference/`

| File | What it does |
|---|---|
| `boundary.md` | The server-only import boundary — the three overrides blocks that keep database code out of the browser, and the two ways this config can fail silently. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

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
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `tooling/eslint-config/docs/reference/`

| File | What it does |
|---|---|
| `meta.json` | Sidebar title, description and page order for this docs folder. |
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
| `explained-publish.mjs` | `pnpm explained:publish`: publishes this plain-language guide (`docs/explained/`) into a running app's docs as one space, in any organization. It signs in, creates or updates the space, then creates, reorders, saves and publishes only the pages that changed, in `meta.json` order. Links between guide pages become doc routes and links to other repository files point at the git origin. `--audience` sets who may read it, `--prune` removes pages the folder no longer has. |
| `guide-publish.mjs` | `pnpm guide:publish`: publishes the super admin guide (the Markdown files in `guide/`) into a running app's docs. It signs in as a super admin, opens the platform organization, creates the space, and creates, reorders, saves and publishes only the pages that changed. `--prune` removes pages no longer listed. |
| `package.json` | Manifest for the repository's own scripts, so they are type-checked and tested like any package. |
| `source-text.mjs` | Small text parsers the architecture check is built from: finding imports, stripping comments, reading SQL columns and indexes, skipping fenced code in Markdown. Pure functions, so they are unit-tested. |
| `tsconfig.json` | TypeScript settings that type-check the `.mjs` scripts and their tests as JavaScript. |
| `vitest.config.ts` | Test runner settings for the scripts, with a longer timeout because each architecture-check test spawns the script over a temporary file tree. |

### `tooling/scripts/docs/`

| File | What it does |
|---|---|
| `index.md` | What the scripts in this folder are, and every place the small kit's architecture check differs from the big kit's. |

### `tooling/scripts/guide/`

| File | What it does |
|---|---|
| `access-links.md` | Guide page: tying a doc space or page to a module, permission, flag or plan so only people with that access can see it. |
| `account-settings.md` | Guide page: the account settings screens: profile, password, sessions, two-factor. |
| `accounts-admin.md` | Guide page: the platform's accounts screen: finding any user, suspending and reinstating an account, exporting or deleting a tenant. |
| `ai-search.md` | Guide page: uploading documents and searching them by meaning, and what happens when no AI provider is configured. |
| `api-keys.md` | Guide page: creating and revoking API keys. |
| `audiences.md` | Guide page: the four audiences a doc space can have: members, public, granted, owner. |
| `big-picture.md` | Guide page: the three programs and the services behind them, in plain words. |
| `dashboard.md` | Guide page: the dashboard after sign-in. |
| `data.md` | Guide page: where each kind of data is stored and why. |
| `delete-tenant.md` | Guide page: deleting an organization and everything it owns, and the 30-day archive kept afterwards. |
| `doc-grants.md` | Guide page: letting a specific person, organization or plan read a "granted" doc space. |
| `docs-speed.md` | Guide page: why large doc spaces stay fast. |
| `entitlements.md` | Guide page: plans, what each plan allows, and per-organization adjustments such as trials. |
| `export.md` | Guide page: exporting all of an organization's data. |
| `flags.md` | Guide page: feature flags: what they are, turning one on for some organizations, and why each one expires. |
| `google.md` | Guide page: signing in with Google and how to configure it. |
| `how-docs-work.md` | Guide page: how the docs system stores, publishes and serves pages. |
| `mail.md` | Guide page: how email is sent, retried and where to see it locally. |
| `manifest.json` | The guide's table of contents: the "Super admin guide" space (title, icon, theme, who can read it) and every section and page in order, with each page's title, icon and description. |
| `markdown.md` | Guide page: everything you can write in a doc page: headings, code, callouts, tabs, steps, accordions, cards. |
| `members.md` | Guide page: inviting people, changing their role and removing them. |
| `modules.md` | Guide page: what a module is and how it decides what shows in the menu. |
| `notifications.md` | Guide page: the notification inbox and per-user notification preferences. |
| `organizations.md` | Guide page: organizations (tenants), switching between them and founding a new one. |
| `overrides.md` | Guide page: giving or taking away one permission from one person, on top of their role. |
| `plans.md` | Guide page: creating and editing plans and assigning them to organizations. |
| `reader-extras.md` | Guide page: breadcrumbs, previous/next links, the GitHub link and "Open in ChatGPT / Claude" in the docs reader. |
| `reading.md` | Guide page: reading docs: the sidebar, search, themes, and copying a page as Markdown. |
| `reset-password.md` | Guide page: the forgotten-password flow. |
| `roles.md` | Guide page: roles, the permission grid, and which roles you are allowed to hand out. |
| `sign-in.md` | Guide page: signing in, two-factor codes and suspended accounts. |
| `sign-up.md` | Guide page: signing up, verifying the email address, and which organization a new person joins. |
| `status.md` | Guide page: the platform status screen: queues, database, caches. |
| `troubleshooting.md` | Guide page: common problems and what to check. |
| `welcome.md` | Guide page: what the guide is and how to read it. |
| `words.md` | Guide page: a glossary of the words used across the app. |
| `worker.md` | Guide page: the background worker and what it does on a schedule. |
| `writing.md` | Guide page: writing, saving, publishing and restoring doc pages. |
| `your-account.md` | Guide page: everything about your own account. |

### `tooling/scripts/tests/`

| File | What it does |
|---|---|
| `check-architecture.spec.mjs` | Tests every architecture check twice: once against a temporary file tree that breaks the rule, once against one that obeys it. |
| `compose-wait.spec.mjs` | Tests how the wait script reads each container state Docker can report. |
| `compose.spec.mjs` | Tests that the compose wrapper passes the root `.env` to Docker. |
| `source-text.spec.mjs` | Tests the text parsers against inputs that once fooled them, such as `//` inside a string. |

### `tooling/tsconfig/`

| File | What it does |
|---|---|
| `package.json` | Manifest for `@loadbearing/tsconfig`, the shared TypeScript presets. It exposes the four JSON files under `src/`. |

### `tooling/tsconfig/docs/`

| File | What it does |
|---|---|
| `index.md` | One strict base and three presets, published as a workspace package so every tsconfig.json in the repository is four lines long. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `tooling/tsconfig/docs/reference/`

| File | What it does |
|---|---|
| `base.md` | Every compiler option in the shared base, grouped by what it does — and the five that carry real architectural weight. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `presets.md` | The three thin presets — library, node-esm, react — what each changes and which packages pick it. |

### `tooling/tsconfig/src/`

| File | What it does |
|---|---|
| `base.json` | The strict TypeScript settings every package inherits: ES2024, strict mode, unchecked index access treated as possibly undefined, and the rest. |
| `library.json` | Preset for packages bundled by tsup: base settings plus bundler-style module resolution, no output from `tsc`. |
| `node-esm.json` | Preset for code Node runs directly (the worker, the realtime app, scripts): Node's own ES module resolution and Node types. |
| `react.json` | Preset for React packages: base settings plus browser types and JSX. |
