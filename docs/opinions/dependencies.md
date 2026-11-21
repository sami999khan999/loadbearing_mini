---
title: Dependencies
description: Four tiers by what a dependency can constrain, why framework-agnostic is not runtime-agnostic, and which layer may name what.
---

# Dependencies

The kit targets **React, Next.js and TanStack Start** on the front and **pure Node, Express, NestJS,
Fastify and Hono** on the back; every dependency is measured against that list.

**Every version lives in `pnpm-workspace.yaml`** (Tiers 1–3). A `package.json` writes
`"zod": "catalog:"`, never a range — one place to upgrade, and no silent drift onto two majors.

---

## The four tiers

Grouped by **what a dependency can constrain**, not what it does.

### Tier 0 — never imported

What the deployment provides and **no `package.json` names**: Postgres, both Redis instances,
S3/MinIO, Loki, the Alloy agent shipping stdout to it, ClickHouse — all in `infra/docker-compose.yml`.
Without this tier, question 2 below would file a log aggregator under build tooling.

**Reached over a protocol is not imported.** `ClickHouseAnalyticsProjector` and `LokiLogReader` are
real adapters behind real ports, both `fetch` against a documented HTTP API — no SDK, no manifest
line. `OpenAiEmbeddingProvider` set the pattern. **Tier 0 is quarantined behind a protocol** (stdout,
SQL, S3's API) the code speaks anyway, as Tier 2 is behind a port. `JsonLogger` writes stdout and
knows nothing of Loki; Alloy ships it. If `@loadbearing/observability` ever imports a Loki client, a
log-platform swap stops being a config change.

**The tier is decided by the manifest, not by whether code talks to the thing.** Postgres is Tier 2
(`pg`, `drizzle-orm`); ClickHouse and Loki stay Tier 0 with adapters. An earlier version of this page
predicted a `LogReader` port, `LokiLogReader` and `LOKI_URL` would push Loki to Tier 2 and end the
config-change swap. All three now exist and it did not happen: the write path gained no dependency,
the read path added no package, and `LOKI_URL` is optional — a swap rewrites one 130-line reader. A
`LogReader` with an SDK behind it *would* be Tier 2; with `fetch` it is Tier 0 with a seam.

### Tier 1 — never ships

Build, test and lint tooling, which never reaches a consumer: `typescript`, `tsup`, `vitest`,
`biome`, `eslint`, `drizzle-kit`, `tailwindcss` and `@tailwindcss/vite` (it ships only generated CSS),
every `@types/*`.

**Exception: `tsup` never ships but decides what does** — every package being ESM-only, and whether
`"use client"` survives into `dist/`. A bundler upgrade is a portability change.

### Tier 2 — framework-agnostic runtime

Ships and works under every target framework. **Framework-agnostic is not runtime-agnostic:**

| | Runs in | Entries |
|---|---|---|
| **isomorphic** | server, browser, worker, webview, edge | `zod`, `@orpc/contract`, `@orpc/client`, `clsx` and `tailwind-merge` behind `cn` in `packages/ui` |
| **node-only** | a Node process, under any framework | `pg`, `ioredis`, `bullmq`, `drizzle-orm`, `@aws-sdk/*` |

`pg` and `ioredis` need raw TCP and die on an edge runtime (one config line away in Next). **That is
why each sits behind an abstract class in `packages/application/src/port/`** — a use-case must not
learn which runtime it landed on.

### Tier 3 — framework-scoped

Each names a framework and is quarantined to one layer.

| Entry | May appear in | Why only there |
|---|---|---|
| `@orpc/server` | `packages/api-server`, `apps/*/src/server/` | The transport seam. HTTP adapters (`@orpc/server/fetch`, `/node`) stay in the apps — they change with the HTTP framework. The router half (`authed` chain, error interceptor, stream router) is bound to oRPC, not HTTP, and lives in `api-server` because `web` (every procedure) and `realtime` (streams) both mount it; copying it would duplicate the subtlest code in the transport. Recorded 2026-09-26 as `CP6.4`. |
| `@tanstack/react-router` | `apps/` | Routing is app-shaped. A Next app brings its own and reads paths from `@loadbearing/permissions`. |
| `@tauri-apps/api` | `apps/desktop` | Desktop shell only, not installed — the app does not exist. |
| `@tanstack/react-query`, `@orpc/tanstack-query` | `packages/{query,ui,feature}` | React-scoped, inside the target set — every front-end target is React. |
| `@base-ui/react` | `packages/ui` | Headless primitives (focus traps, dismissal, roving focus, ARIA). Only `ui` names it, via `import.ts`, so a swap is one package. |
| `better-auth` | `packages/auth` | Multi-framework by export map: `./node` covers Node, Express, Fastify, Nest; `./next-js` and `./tanstack-start` two front-ends; the core handler Hono. |

`check-architecture.mjs` asserts the quarantine.

---

## Adding a dependency

The first "yes" decides.

1. **Does the deployment run it rather than the code import it?** → Tier 0.
2. **Does it never reach a consumer's bundle or `dist/`?** → Tier 1.
3. **Does it name a framework, router or shell?** → Tier 3; say in the catalog which layer may
   import it. Framework-scoped inside `packages/` is a mistake unless it is React.
4. **Otherwise Tier 2** — isomorphic or node-only? Node-only needs a port in `application/src/port/`
   before any use-case reaches it.

**A Tier 3 you want in `packages/` almost always wants an abstract class instead** — which is how
`infrastructure` holds `drizzle-orm` while `application`'s `TaskRepository` has never heard of SQL.

---

## Families that pin siblings exactly

The four `@orpc/*` packages pin each other exactly:

```
@orpc/contract → "@orpc/shared": "1.15.0"     ← exact, not ^1.15.0
@orpc/client   → "@orpc/shared": "1.15.0"
```

A skew puts **two copies of the shared core in the tree** — the failure that makes `ErrorNormalizer`
match structurally rather than with `instanceof`. **Keep the family on one version line**, noted at
each catalog entry, since the tiers split `@orpc/*` across 2 and 3.

> [!WARNING]
> **`syncpack lint` does not catch this** — it checks one dependency's range across packages, not a
> group that moves together. This catalog shipped `@orpc/server` at `^1.13.7` under a comment saying
> *"pin all four together"* with every check green, which is why it became a `check-architecture.mjs`
> assertion.

---

## React is a peer, never a dependency

`react` and `react-dom` are `peerDependencies` in `ui`, `query` and `feature`. The app supplies the
single copy, so there is no duplicated renderer behind an "invalid hook call". They live in the named
catalog `catalog:react`, which moves on React's cadence and marks a package as a React package.

---

## What is enforced

| Rule | Enforced by |
|---|---|
| Framework-scoped entries stay out of `packages/` | `check-architecture.mjs` §1 |
| `@orpc/*` on one version line | `check-architecture.mjs` §4 |
| One range per dependency across packages | `syncpack lint` |
| Dependency ordering in `package.json` | `sherif` |
| No version published in the last 24h | pnpm `minimumReleaseAge` |
| Tier placement, and the port rule for node-only | Review — the row to shrink |
| The server-only packages stay out of a client bundle | `biome` `noRestrictedImports`, `check-architecture.mjs` §8 |

**The ban list is the layering graph, written for a linter.** `ui`, `feature`, `query`, `errors`,
`content` and `asset` may not name `application`, `infrastructure`, `auth`, `composition`,
`drizzle-orm`, `pg`, `ioredis`, `bullmq` or `better-auth` — everything to their right in
[Layering](../ai/rules/layering.md). `content` and `asset` were missing while the graph wrongly put
them right of `composition`, which imports `content` for the two mailers.
