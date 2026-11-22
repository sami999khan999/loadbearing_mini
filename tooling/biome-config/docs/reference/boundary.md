---
title: boundary
description: The server-only import boundary — the three overrides blocks that keep database code out of the browser, and the two ways this config can fail silently.
---

# The server-only boundary

The rule keeping database code out of the client bundle lives entirely in `overrides`, and is the first
of three independent defences.

> [!CAUTION]
> A Drizzle import reaching the client is not a bundle-size regression — it publishes your connection
> string's shape and full table schema to anyone with devtools. Hence three defences.

---

## Block 1 — the ban

```json
{
  "includes": ["packages/ui/**", "packages/feature/**", "packages/query/**", "packages/errors/**",
               "packages/content/**", "packages/asset/**", "apps/web/src/**"],
  "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": {
    "paths": {
      "@loadbearing/infrastructure": "Server-only. Cross the boundary via @loadbearing/contracts.",
      "@loadbearing/auth":           "…",
      "@loadbearing/composition":    "…",
      "@loadbearing/application":    "…",
      "@loadbearing/api-server":     "…",
      "drizzle-orm": "Server-only dependency. It must never appear in a client bundle.",
      "pg": "…", "ioredis": "…", "bullmq": "…", "better-auth": "…"
    }
  } } } }
}
```

**Five workspace packages and five third-party ones.** Most hold pools, credentials and vendor SDKs;
`application` is harmless to bundle, but a component importing a use-case would call business logic
directly instead of through the transport. **The sanctioned crossing is `@loadbearing/contracts`** —
isomorphic by construction (Zod schemas, I/O-free entities, the oRPC contract).

> [!NOTE]
> **Biome's `noRestrictedImports` takes exact module paths, not globs** — fine for exact package names,
> but `drizzle-orm/*` (`drizzle-orm/pg-core` is the common one) cannot be expressed; subpath coverage
> would move to ESLint `no-restricted-imports` `patterns`.

---

## Block 2 — the escape hatch

```json
{
  "includes": ["apps/web/src/server/**", "**/*.server.ts"],
  "linter": { "rules": { "style": { "noRestrictedImports": "off" } } }
}
```

**One directory and one filename suffix** — narrowness is the design: a file's path answers whether it
may touch the database. `apps/web/src/server/**` holds the whole transport layer (container, oRPC base
and routers, error interceptor, in-process SSR client); `**/*.server.ts` is the per-file opt-out for a
server-only helper beside its route.

> [!IMPORTANT]
> **Later overrides win, so the escape hatch must come after the ban.** Reversed, it silently does
> nothing.

One `src/server/` directory is also the migration seam: if NestJS ever owns the API, it moves to
`apps/api` and nothing around it changes.

---

## Block 3 — the `env.ts` exemption

```json
{
  "includes": ["apps/*/src/env.ts"],
  "linter": { "rules": { "style": { "noProcessEnv": "off" } } }
}
```

Only each app's `env.ts` may read `process.env`, which makes "config arrives through `ContainerConfig`"
checkable, and lets the system be built in a test with a fake database and frozen clock. (Runnable
scripts and config files above `src/` have their own `noProcessEnv` exemptions by exact path.)

---

## Two ways this config fails silently

Both reproduced on Biome 2.5.7; both give a **green lint run** with the boundary gone.

### 1 — overrides replace rule options; they do not merge

When two overrides matching a file both set `noRestrictedImports`, only the last one's `paths` apply.

> [!CAUTION]
> Verified: a second `packages/feature/**` override listing only feature's own two bans made
> `import { Database } from "@loadbearing/infrastructure"` in `feature` **pass**. An override for a
> package Block 1 covers must restate every path.

So there is exactly **one** `noRestrictedImports` ban override, and `feature`'s extra bans live in
ESLint — which they must, for the next reason.

### 2 — `import type` is flagged like a value import

There is no type-import exemption, so `feature`'s `@loadbearing/api-client` ban (where `SignInForm`
needs `import type { AuthClient }`) lives in ESLint with `allowTypeImports: true`. Keep the
**server-only** paths here strict: a React package naming a type from `auth`, `infrastructure` or
`composition` is reaching across the boundary instead of through `contracts`.

---

## Verifying the boundary

Test it, do not trust it — after any `overrides` change, then delete the probes:

```bash
# must ERROR
echo 'import { Database } from "@loadbearing/infrastructure";' > packages/feature/src/probe.ts
pnpm exec biome lint packages/feature/src/probe.ts

# must PASS — escape hatch
echo 'import { Database } from "@loadbearing/infrastructure";' > apps/web/src/server/probe.ts
pnpm exec biome lint apps/web/src/server/probe.ts

# must ERROR, then PASS
echo 'const x = process.env.FOO;' > packages/ui/src/probe.ts
echo 'const x = process.env.FOO;' > apps/web/src/env.ts
pnpm exec biome lint packages/ui/src/probe.ts apps/web/src/env.ts
```

---

## The other two defences

| # | Defence | Catches | When |
| --- | --- | --- | --- |
| 1 | this import boundary | a direct import | as you type |
| 2 | `ServerOnly.assert()` at each server-only barrel | module evaluation in a browser | at runtime |
| 3 | CI grep over built client assets | a transitive re-export no import rule sees | in CI |

Biome can be silenced by a suppression comment, the assertion fires only on executed paths, and only
the bundle grep inspects what shipped.

> [!WARNING]
> The grep needs `apps/web` built first — a grep over a missing directory passes, so it must fail on zero
> asset files, as `check-architecture.mjs` does.

---

## See also

- [Overview](../index.md) — the formatter, assist, and lint configuration
- [`@loadbearing/eslint-config` rules](../../../eslint-config/docs/reference/rules.md) — the bans that need nuance
