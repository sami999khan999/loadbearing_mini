---
title: Opinions
description: The positions this repository takes, stated flatly. Naming, folders, imports, classes, vocabulary, data ownership, visibility, simplicity, comments.
---

# Opinions

Every rule this repository has decided: each page states a position, the reason, the failure it
prevents, and what enforces it — a rule nothing checks is a suggestion.

**Every rule serves one of two tests:**
1. Given a feature name and a layer, you can write the file path, folder and class name without
   looking anything up.
2. Given a fact the system produces, you can say which store owns it.

Most pages serve the first; [Data and scale](data-and-scale.md) serves the second, and matters most
early — a late naming rule costs a rename, a late storage rule a migration with customer data in it.
A rule that stops producing either has a gap to fix. [Simplicity](simplicity.md) is last on purpose:
the tie-breaker when two designs satisfy every other rule.

---

## The pages

| Page | Decides |
|---|---|
| [Files](files.md) | Casing, role suffixes, one class per file |
| [Folders](folders.md) | What `src/` looks like, role folders vs subject folders, what may sit at the root |
| [Imports and exports](imports.md) | `index.ts`, `import.ts`, the three import rules, why `export *` is banned |
| [Dependencies](dependencies.md) | The four tiers, which layer may name a framework, what the catalog enforces |
| [Classes and methods](classes.md) | Class-name grammar, banned suffixes, the method vocabulary |
| [Vocabulary](vocabulary.md) | Permissions, procedures, events, queues, contract members, database, env, React |
| [Data and scale](data-and-scale.md) | Which store owns which data, what is derived, what to build now, the order scaling moves happen in |
| [Visibility](visibility.md) | Flags, entitlement, permissions and widget preferences — why something is missing from a screen, and which answer wins |
| [Simplicity](simplicity.md) | How much structure to build, and why performance is part of the goal rather than the trade |
| [Comments](comments.md) | Line comments only, two lines, where the reasoning goes instead |

---

## The three broken most

1. **`src/` holds `index.ts`, `import.ts` and folders — nothing else.** One loose file is a
   precedent. [Folders](folders.md)
2. **The barrel names every export.** `export *` hides API widening from review; Biome's
   `noReExportAll` enforces it. [Imports and exports](imports.md)
3. **Comments are `//`, at most two lines.** The argument goes in `docs/reference/`.
   [Comments](comments.md)

---

## Where these rules are enforced

| Rule | Enforced by |
|---|---|
| No `export *` | Biome `performance/noReExportAll` |
| Explicit member accessibility | Biome `style/useConsistentMemberAccessibility` |
| `import type` for type-only imports | Biome `style/useImportType` + `verbatimModuleSyntax` |
| No `process.env` outside `apps/*/src/env.ts` | Biome `style/noProcessEnv` |
| Layer bans (`ui` may not import `infrastructure`, …) | Biome `noRestrictedImports` overrides |
| `application` may not import `HTTP_STATUS` | ESLint `no-restricted-imports` |
| No exported free functions in OOP packages | ESLint `no-restricted-syntax` |
| Consistent file casing | `forceConsistentCasingInFileNames` |
| Framework-scoped dependency inside `packages/` | `check-architecture.mjs` §1 |
| The domain layer never logs | `check-architecture.mjs` §2 |
| `process.env` only in `apps/*/src/env.ts` | `check-architecture.mjs` §3 |
| One version line per `@orpc/*` package | `check-architecture.mjs` §4 |
| Comments are `//`, never a block | `check-architecture.mjs` §5 |
| No top-level `await` in a package barrel | `check-architecture.mjs` §6 |
| `"use client"` only in `ui`, `query`, `feature` | `check-architecture.mjs` §7 |
| No server code in the client bundle | `check-architecture.mjs` §8 |
| Every domain table declares `organization_id` | `check-architecture.mjs` §9 |
| The audit port is `ActivityLogger`, never `AuditTrail` | `check-architecture.mjs` §10 |
| The schema barrel names every `*.schema.ts` | `check-architecture.mjs` §11 |
| Every page on this index is cited by a `docs/ai/rules/` file | `check-architecture.mjs` §12 |
| Every folder under `docs/` has an `index.md` | `check-architecture.mjs` §13 |
| Every inline widget is placed by a literal key | the big kit's §30; returns with widgets, see [`docs/scale/widgets.md`](../scale/widgets.md) |
| No flag outlives its expiry, and none goes unread | `check-architecture.mjs` §31 |
| No `lazy()` in `feature` or `apps/web` | ESLint `no-restricted-syntax` |
| One range per dependency across packages | `syncpack lint` |
| Loki labels stay within `app, env, level, event_code` | `upstream:infra/alloy.config.alloy` — the pipeline promotes exactly four |
| A query that cannot be scoped to a tenant | Review |
| Everything else on these pages | Review |

The last row is the one to shrink: a rule moved from review to a check stops being argued about.
`check-architecture.mjs` exists because the most important rules here are ones no linter expresses.
