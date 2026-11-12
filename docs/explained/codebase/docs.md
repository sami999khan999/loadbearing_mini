---
title: The docs folder
description: The written rules, the arguments behind them, the build order, the running stack, the plans and the way back to the big kit.
---

# The docs folder

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

`docs/` is the repository's written knowledge. It is plain Markdown, read on GitHub or in an editor; it is not the in-app docs system.

- `ai/` holds the rules, stated flatly and short enough for an AI agent to load whole.
- `opinions/` holds the argument behind each rule: the failure it prevents.
- `setup/` is the build order, from an empty folder to the running app, in thirty-one steps.
- `infra/` explains the running Docker stack.
- `plans/` holds the small kit's plans and handoff note.
- `scale/` explains, piece by piece, how to bring back each part the small kit removed.

These pages (`explained/`) are listed in the guide's own index rather than here.

This page covers 97 files.

## Every file

### `docs/`

| File | What it does |
|---|---|
| `data-flow.md` | One request followed from arrival to months later — which store it touches, in what order, and why each store exists. The narrative companion to the data ownership rules. |
| `index.md` | The four documentation trees and what each is for — the rules an agent loads, the argument behind them, the build order, and the running stack. |

### `docs/ai/`

| File | What it does |
|---|---|
| `index.md` | Everything written for coding agents rather than for people. The task router — one row per thing you might be about to do — plus the rules and the skill run books it points at. |

### `docs/ai/rules/`

| File | What it does |
|---|---|
| `classes.md` | Role nouns for seams, technology prefixes for implementations, the method vocabulary, and the assert/can split. |
| `color.md` | Every colour is one of the twelve custom properties, read as var(). The one file allowed to write a literal, how to derive a state, and why a hex passes every other check. |
| `comments.md` | Line comments only, two lines maximum, and where the reasoning goes instead. |
| `data.md` | Which store owns which data, what is derived, and what is non-negotiable in any new schema — in the lite kit, where the scale stores are not running but every seam is. |
| `dependencies.md` | The catalog, the four tiers, and the four questions that decide which tier a new dependency lands in. |
| `explaining.md` | Rule: how to explain something so the reader ends up with the right picture: answer first, plain words first, problem before solution, verify before explaining. |
| `files.md` | Kebab-case everywhere, the closed set of role suffixes, one class per file, where tests go. |
| `folders.md` | What src/ may hold, role folders vs subject folders, and the two exceptions worth knowing before you place a file. |
| `imports.md` | One entrypoint, barrels that name every export, the three import rules, and the one outside surface. |
| `index.md` | The rules an agent must know unprompted, one file per topic. A digest of docs/opinions/ — that directory holds the argument, these files hold the rule. |
| `layering.md` | The one-way dependency graph, the server-only boundary, and where a concrete adapter may be named. |
| `simplicity.md` | The tie-breaker when two designs satisfy every other rule: the least structure that achieves the goal. |
| `visibility.md` | Rule: the reasons something can be missing from a screen (flag, entitlement, permission), who controls each, and what the API answers. |
| `vocabulary.md` | Four grammars that look alike and mean different things, plus the naming rules whose violation is silent. |
| `workflow.md` | The commands, what to run before claiming a change is done, the commit convention, who a commit is authored by, and where the feature run book lives. |

### `docs/ai/skills/`

| File | What it does |
|---|---|
| `add-docs.md` | The run book for writing docs/ inside a package — what index.md must answer, when a reference page earns its place, and the meta.json that orders them. |
| `add-slice.md` | The twelve-step path a feature takes through the packages, as an executable checklist. Setup 27.4 is the reasoning; this is the run book. |
| `index.md` | Run books — the executable checklist form of a procedure that touches many packages in a fixed order. |

### `docs/infra/`

| File | What it does |
|---|---|
| `deployment.md` | One VPS now, managed services later — what changes, what never changes, and the order to move things in when it stops fitting on one box. |
| `index.md` | The local stack — every file, every service, and how they reach each other. Five containers, no profiles, one bridge network. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `docs/infra/reference/`

| File | What it does |
|---|---|
| `compose.md` | Five services, no profiles, three volumes and one network — what every block does and which parts are load-bearing. |
| `mailpit.md` | The SMTP sink — every outbound mail is caught and displayed, none is delivered. One env var separates it from a real provider. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `minio.md` | The S3 stand-in, the one bucket and its three prefixes, and the one-shot container that creates it. |
| `postgres.md` | The source of truth — the pgvector image, the three extensions, and why the init script runs exactly once. |
| `redis.md` | One instance for the cache, the queue and realtime — durable, never evicts — every flag explained, and why the cache and the queue keep separate URLs. |

### `docs/opinions/`

| File | What it does |
|---|---|
| `classes.md` | Plain role nouns for seams, technology prefixes for implementations, and a closed method vocabulary. |
| `comments.md` | Line comments only, two lines maximum, and the argument for a design lives in docs/reference instead. |
| `data-and-scale.md` | Which store owns which data, what is derived, what to build now, and the order every scaling move happens in. |
| `dependencies.md` | Four tiers by what a dependency can constrain, why framework-agnostic is not runtime-agnostic, and which layer may name what. |
| `files.md` | Kebab-case everywhere, a dot-suffix for every architectural role, one class per file. |
| `folders.md` | src/ holds index.ts, import.ts, and folders. Role folders by default, subject folders where contents repeat per feature. |
| `imports.md` | index.ts is what a package gives, import.ts is what it takes. Barrels name every export; export * is banned. |
| `index.md` | The positions this repository takes, stated flatly. Naming, folders, imports, classes, vocabulary, data ownership, visibility, simplicity, comments. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `simplicity.md` | The least structure that achieves the goal — and performance is part of the goal, not the thing traded away to reach it. |
| `visibility.md` | Four independent reasons something is missing from a screen — a flag, an entitlement, a permission, a widget preference — the order they resolve in, and the one answer to "why is it gone". |
| `vocabulary.md` | Permissions, procedures, events, queues, contract members, database objects, env vars, React. |

### `docs/plans/`

| File | What it does |
|---|---|
| `BACKLOG.md` | The only open ledger for the lite kit — work found and not yet planned. Items graduate into a plan or are dropped. |
| `DOCS-SYSTEM-PLAN.md` | The finished plan for the docs system: access links to modules, permissions, flags and plans; whole-docs search; and the reader features. |
| `HANDOFF.md` | Where the lite kit's build stopped, what is verified, and exactly how to pick it up on any machine or in a fresh session. |
| `LITE-KIT-PLAN.md` | The plan that cut this small kit from the big kit, and how it can grow back. |
| `TESTS.md` | Every test run the lite kit build still owes, by plan item, with the commands, so the build can go ahead on typecheck alone and the runs can be done in one pass. |
| `UI-KIT-PLAN.md` | The finished plan that moved the UI to Tailwind v4, Base UI and `cn`. |
| `index.md` | Live plans for the lite kit. Finished plans move to archive/ with a row here. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `docs/scale/`

| File | What it does |
|---|---|
| `analytics.md` | Bringing back ClickHouse, the separate analytics store, so reports over time stop loading the main database. |
| `back-ports.md` | Features that exist in lite but not in the big kit, and why each must be added to the big kit to keep the two kits one design. |
| `beyond-the-big-kit.md` | The scaling moves the big kit has designed for but not built — new work in either kit, landing as new adapters rather than a rewrite. |
| `index.md` | What the lite kit cannot do at larger scale, and how each limit is fixed by bringing back a piece of the big kit — written to be read without access to the big kit's repository history. |
| `logs.md` | Bringing back Loki and Alloy, so logs from every server land in one searchable place — mostly infrastructure, because the app already writes the right format. |
| `messaging.md` | How direct and group messages were brought back into lite on 2026-11-12, kept for the next port. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `pgbouncer.md` | Putting a connection pooler in front of Postgres — config only, because lite's code is already written as if one were there. |
| `porting.md` | The general procedure for bringing a piece of the big kit back into the lite kit — getting the source, the copy order, migrations, wiring, and the checks that prove it worked. |
| `read-replica.md` | Adding a read-only copy of the database so heavy reads stop competing with writes — config first, and possibly one admin panel to port. |
| `retention.md` | Bringing back retention and cold storage, so old months move out of the database into cheap file storage instead of growing forever. |
| `shard-nodes.md` | Moving from one database machine to several, with each organization's data living on one of them — the biggest scaling move, and the only one that needs someone to operate it. |
| `split-redis.md` | Moving from one Redis to separate cache and queue instances — a config-only change, because the code already reads two URLs. |
| `widgets.md` | Bringing back the fourth visibility mechanism — dashboard cards a user or org admin can hide — which lite left out. |

### `docs/setup/`

| File | What it does |
|---|---|
| `00-README.md` | How the build-order documents work and the order to read them in. |
| `01-prerequisites.md` | Build step 1: what to install first (Node, pnpm, Docker) and why each version. |
| `02-repo-skeleton.md` | Build step 2: the empty repository: folders, git, editor settings. |
| `03-workspace-and-catalogs.md` | Build step 3: the pnpm workspace and the catalog that holds every dependency version, grouped by what a dependency can constrain. |
| `04-typescript-configs.md` | Build step 4: the shared TypeScript settings and presets. |
| `05-lint-and-format.md` | Build step 5: Biome and ESLint, and the import boundaries they enforce. |
| `06-package-anatomy.md` | Build step 6: the shape every package shares (`src/`, `tests/`, `docs/`, the entry point, the build). |
| `07-core-package.md` | Build step 7: the `core` package. |
| `08-permissions-package.md` | Build step 8: the `permissions` package. |
| `09-errors-package.md` | Build step 9: the `errors` package. |
| `09b-observability-package.md` | Build step 9b: the `observability` package. |
| `10-contracts-package.md` | Build step 10: the `contracts` package. |
| `11-local-infrastructure.md` | Build step 11: the local Docker stack. |
| `12-application-package.md` | Build step 12: the `application` package: principal, authorizer and ports. |
| `13-infrastructure-postgres.md` | Build step 13: the Postgres side of `infrastructure`: schema, migrations, repositories, transactions. |
| `14-vector-store.md` | Build step 14: vector storage with pgvector. |
| `15-infrastructure-package.md` | Build step 15: the rest of `infrastructure`: Redis, S3, queues, mail. |
| `16-auth-package.md` | Build step 16: the `auth` package. |
| `17-composition-container.md` | Build step 17: the `composition` package and its container. |
| `18-api-client-package.md` | Build step 18: the `api-client` package. |
| `19-asset-package.md` | Build step 19: the `asset` package. |
| `20-content-package.md` | Build step 20: the `content` package. |
| `21-query-package.md` | Build step 21: the `query` package. |
| `22-ui-package.md` | Build step 22: the `ui` package. |
| `23-feature-package.md` | Build step 23: the `feature` package. |
| `24-web-app.md` | Build step 24: the web app, with TanStack Start and oRPC. |
| `25-worker-app.md` | Build step 25: the worker app and its background jobs. |
| `26-hygiene-and-ci.md` | Build step 26: CI, git hooks and every check in `check-architecture`, with the failure that put each one there. |
| `27-verification-and-first-feature.md` | Build step 27: checking the whole thing works, and adding your first feature. |
| `28-folder-structure.md` | Reference: the folder structure of the whole repository. |
| `29-naming-and-boundaries.md` | Reference: naming rules and the boundaries between packages. |
| `30-desktop-app.md` | An optional extra: how a Tauri desktop app would be added. The desktop app is described here but not in the repository. |
| `index.md` | The thirty-one documents that build the kit from an empty directory to a running app, in the order they must be worked. |
