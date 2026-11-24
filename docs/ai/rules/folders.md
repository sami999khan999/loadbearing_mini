---
title: Folders
description: What src/ may hold, role folders vs subject folders, and the two exceptions worth knowing before you place a file.
---

# Folders

- **`src/` holds `index.ts`, `import.ts` and folders. Nothing else** — no loose helper or type.
- **Every folder has an `index.ts`**, so a file can move within it without touching imports
  elsewhere. Exempt: `content/src/message/{en,bn}/` (reached by string-literal `import()`; a barrel
  collapses the code-split) and folders holding no modules, such as `ui`'s `style/`.
- **Role folder by default, subject folder where contents repeat per feature.** Role folders use
  the shared vocabulary: `catalog/` `registry/` `port/` `primitive/` `gate/` `route/` `flag/`
  `widget/` `procedure/` `schema/` `container/` `fake/` `key/` `consumer/` `subscriber/`
  `schedule/` `bootstrap/` `component/` `style/`. **Never plural.** A subject folder is singular and
  **every file in it is prefixed with the folder's name**.
- **A new folder name is a decision.** If it already means something else in
  `docs/opinions/folders.md`, it is the wrong name.
- **Two exceptions.** `infrastructure` splits a slice across `pg/schema/` and `pg/repository/`
  (drizzle needs one barrel naming every table). Repository *ports* live in the slice, not in
  `application/src/port/` — `port/` is for cross-cutting seams: a second feature adds a *method*
  to a port, a *file beside* a slice port.
- **Every folder under `docs/` has an `index.md`** unless it holds no Markdown. `reference/` is
  exempt: its parent index names every page and `meta.json` orders them. A CI assertion.
- **An app's root is closed; only framework-resolved files stay loose** — `main.ts`, `env.ts`,
  and `apps/web`'s `router.tsx`, `endpoint.ts`, `route-tree.gen.ts`. Startup assembly goes in
  `bootstrap/`.
- **Build-time artefacts and runnable scripts sit above `src/`,** and **runnable scripts sit in
  `script/`, never loose at the package root:** `infrastructure/script/{migrate,seed-dev,seed-prod}.ts`,
  `auth/script/tables.ts`, `asset/script/build-sprite.mjs`. A root holds the manifest, tool configs
  (`*.config.*`, `vitest.setup.ts`), `*.d.ts` and folders (§26). A script inside a folder runs
  when its barrel is imported (that once connected to Postgres mid-sign-in). A script stays thin:
  env in, one class in `src/` called, result printed.

Argument: [`docs/opinions/folders.md`](../../opinions/folders.md).
