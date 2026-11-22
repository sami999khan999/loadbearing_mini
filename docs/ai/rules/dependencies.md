---
title: Dependencies
description: The catalog, the four tiers, and the four questions that decide which tier a new dependency lands in.
---

# Dependencies

**Every version lives in `pnpm-workspace.yaml`.** A `package.json` writes `"zod": "catalog:"`, never
a range.

Four tiers: **0** the deployment runs it and no manifest names it (Postgres, Redis, S3, Loki,
ClickHouse) · **1** never ships (build/test/lint) · **2** ships, framework-agnostic, isomorphic or
node-only · **3** names a framework, quarantined to one layer.

**Placing a new one — first "yes" decides:** Does the deployment run it rather than code import it?
(0) Does it never reach a bundle or `dist/`? (1) Does it name a framework, router or shell? (3)
Otherwise Tier 2 — and **a node-only Tier 2 needs a port in `application/src/port/` before any
use-case reaches it.**

- **Tier 0 sits behind a protocol, Tier 2 behind a port.** `LogReader` over `fetch` is Tier 0; the
  same port over an SDK is Tier 2. The manifest is the boundary.
- **`tsup` never ships but decides what does** — ESM-only output, and whether `"use client"`
  survives into `dist/`. A bundler upgrade is a portability change.
- **Families that pin siblings exactly share one version line** — all four `@orpc/*`. A CI
  assertion; `syncpack` misses it.
- **React is a `peerDependency`** in `ui`/`query`/`feature`, from `catalog:react`.

Argument: [`docs/opinions/dependencies.md`](../../opinions/dependencies.md).
