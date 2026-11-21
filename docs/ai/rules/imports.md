---
title: Imports and exports
description: One entrypoint, barrels that name every export, the three import rules, and the one outside surface.
---

# Imports and exports

- **One public entrypoint, `src/index.ts`:** re-exports only, no logic, no deep subpaths. A package
  wanting more subpaths wants to be two packages.
- **Barrels name every export; `export *` is banned** — it makes the API an accident and ESM
  silently drops colliding names. One exemption: `infrastructure/src/pg/schema/index.ts`.
- **Three import rules, in priority order:** across packages, the package name via `import.ts` ·
  across folders, the folder barrel (`../primitive/index.js`) · within a folder, the direct file
  (`./app.error.js`).
- **Rule 3 is not style.** A sibling imported through its own folder's barrel makes a cycle that
  fails as a runtime `undefined` at module init. Rule 2 yields to rule 3 when a barrel would close a
  loop — **comment the line when you do.**
- **One outside surface, `src/import.ts`:** every import from another workspace package or npm is
  written there once and re-exported; the rest of `src/` imports `./import.js`. **Apps too** —
  `apps/worker` has one, `apps/web` two.
- **`import.ts` re-exports external modules only, never a relative one** — that keeps it
  cycle-free. It governs `src/`, not `tests/`.
- **No `import.ts` means no outside dependency.** Never commit an empty one.
- **`apps/web` splits its surface on the server-only boundary:** `src/import.ts` is client-safe;
  only `src/server/import.ts` may name `@loadbearing/composition` and what is under it.
- **Three tooling-forced exemptions, each commented at the line:** `apps/*/src/env.ts` keeps its
  own imports (its server-only marker cannot be re-exported) · `@tanstack/react-router` is direct in
  `apps/web/src/route/**` (the generator prepends its own `createFileRoute` import) ·
  `@tanstack/react-start` and `/server` are direct in `server/*.fn.ts` (a re-exported `/server`
  entry fails import protection in the browser stub).
- **`.js` extension on every relative import** — `apps/worker` is `NodeNext`.
- **Ordering is Biome's:** `biome check --write` sorts statements and specifiers.

Argument: [`docs/opinions/imports.md`](../../opinions/imports.md).
