---
title: "@loadbearing/permissions"
description: The shared authorization kernel — one permission vocabulary, one resolution algorithm, one nav-gate map, running identically on server, browser, worker, and desktop.
---

# `@loadbearing/permissions`

No hardcoded role check and no second security model holds only if vocabulary, resolution and scope
rules are **one artifact** every runtime loads — oRPC handler, route guards, `<Can>`, worker, Tauri shell.
So: no database, HTTP, React or Node built-ins — pure data plus one algorithm.

| | |
| --- | --- |
| **Package** | `@loadbearing/permissions` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | — nothing at runtime |
| **Used by** | `contracts`, `application`, `infrastructure`, `auth`, `api-client`, `query`, `ui`, `feature`, `content` (type-only), `apps/*` |
| **Environment** | isomorphic — server, browser, worker, and Tauri webview |
| **Build** | `tsup` → `dist/index.js` + `dist/index.d.ts` |

```
packages/permissions/src/
├── index.ts                    ← the public barrel; names only folder barrels
├── registry/                   ← flag-registry, module-registry, permission-registry (no import.ts: nothing from outside)
├── capability/                 → CapabilitySet, CapabilitySetDto, ScopedSetDto, EntitlementMask
├── catalog/                    ← permission fragments: ai apikey core doc member messaging notification platform rbac
├── gate/                       ← nav gates: assistant doc document messaging notification platform rbac
├── flag/                       ← flag fragments: none in lite
└── route/                      ← destinations: account assistant doc document messaging notification organization platform rbac shell
```

Tests mirror `src/` under `tests/`.

---

## The seams

Beside the seams below, the barrel exports the raw tables the registries wrap — `CATALOG`, `GATES`
and `FLAGS` — because the registries' own specs and `content`'s `ModuleKey` read them
directly.

### [`PermissionRegistry`](reference/permission-registry.md) — the vocabulary

```ts
PermissionRegistry.instance.isKnown(rowFromDatabase); // type predicate
PermissionRegistry.instance.scopeOf("member.read");   // "org" | "goal"
```

A frozen catalog (scope, module, label per key). `isKnown()` is the boundary every database string — role
grant, override, API-key scope — must pass.

### [`CapabilitySet`](reference/capability-set.md) — the algorithm

```ts
caps.can("member.deactivate");           // org-scoped
caps.can("task.update", goalId);         // goal-scoped
caps.goalsWith("task.update", ids);      // which of `ids`, resolved by permission
caps.intersect(issuerCaps);              // an API key can never exceed its issuer
CapabilitySet.from(caps.toJSON());       // server → SSR payload → browser, same class
```

Deny by default; explicit deny beats every grant, wildcard included; a goal-scoped key without `goalId`
is `false`, not a throw. One implementation, four runtimes.

### [The platform scope](reference/platform-scope.md) — above the tenant

```ts
caps.can("platform.tenant.manage");      // the third axis, and only the third axis
```

No tenant wildcard, no `core` exception, emptied by an API key's `intersect`, excluded from
`owner: "all"` — four leak paths, one branch in `can()`, four spec cases.

### [`ModuleRegistry`](reference/module-registry.md) — the nav gates

```ts
ModuleRegistry.instance.visibleModules(caps); // readonly ModuleKey[]
```

"May they do X" and "should they see the section" have different owners: `content` owns labels, order
and icons but must never change a gate — hence a second registry.

### [`ROUTES`](reference/routes.md) — the destinations

```ts
ROUTES.rbac.roles;                            // "/settings/roles"
```

One hand-written table of destinations that `GATES` and every shell use — not a generated route tree,
which Nest lacks and each shell generates differently. `ModuleGate.route` is `AppRoute`, so an undeclared
path fails to compile.

### [`EntitlementMask`](reference/entitlement-mask.md) — what the org's plan allows

```ts
EntitlementMask.from({ plan: "all", added, removed, disabledModules }).narrow(dto);
```

Filters role grants before `CapabilitySet.from`, never touching denies, `core` keys or the platform
axis — every check obeys plans unaware, and an upgrade restores roles at once.

### [`FlagRegistry`](reference/flag-registry.md) — what is switched on

```ts
FlagRegistry.instance.clientGating();   // the flags sent to a browser — none in lite
```

Declared in code with owner and expiry, switched in Postgres. Lite declares none; client-gating derives
from widgets, which lite lacks, so new flags stay server-only until [widgets](../../../docs/scale/widgets.md)
are ported.

---

## Fragmented from day one

One `CATALOG` conflicts once three teams edit it, so team fragments merge in a platform barrel:

```ts
// src/catalog/index.ts — changes only when a module is added
export const CATALOG = {
  ...rbacPermissions,
  // ...taskPermissions,
} as const;
```

The literal union survives the spread:

```ts
caps.can("rbac.role.reed");
// TS2820: Did you mean '"rbac.role.read"'?
```

> [!IMPORTANT]
> **A key is never deleted, only stopped being granted** — deleting it makes `isKnown()` reject existing
> `role_permissions` rows. Grants go in a migration first, the key in a later release.

### The key format

```
<module>.<subject>.<action>[.<qualifier>]
```

Lowercase, dotted, no plurals. `.self` means "only rows you own" (the entity defines own), so
`task.update` and `task.update.self` are two keys.

---

## Five bugs the specs pin

Each was found by a failing test:

| # | Defect | Where |
| --- | --- | --- |
| 1 | `isKnown` used `value in CATALOG`, so `"toString"` and `"constructor"` passed the untrusted-input boundary | [permission-registry](reference/permission-registry.md#why-objecthasown-and-not-in) |
| 2 | `intersect()` kept only `this`'s denies, so two wildcard sets granted what one explicitly refused | [capability-set](reference/capability-set.md#intersect-is-a-security-boundary) |
| 3 | `intersect()` iterated only `this`'s goals, discarding a deny inside a goal it had not heard of | [capability-set](reference/capability-set.md#intersect-is-a-security-boundary) |
| 4 | `intersect()` filtered org grants through `can()`, dropping org-level grants of goal-scoped keys | [capability-set](reference/capability-set.md#intersect-is-a-security-boundary) |
| 5 | `intersect()` filtered only `this`'s grants, so a wildcard set intersected down to nothing | [capability-set](reference/capability-set.md#intersect-is-a-security-boundary) |

---

## Testing

`tests/` mirrors `src/` (`src/capability/capability-set.ts` → `tests/capability/capability-set.spec.ts`);
`vitest.config.ts` includes only `tests/**/*.spec.ts` (never `dist/`), and `tsconfig.json` includes
`tests/**` for typecheck.

```bash
pnpm --filter @loadbearing/permissions test
```

No shipped key is goal-scoped, so `capability-set.spec.ts` stubs `scopeOf` to verify rule 3.

---

## See also

- [PermissionRegistry](reference/permission-registry.md) · [CapabilitySet](reference/capability-set.md) · [The platform scope](reference/platform-scope.md) · [ModuleRegistry](reference/module-registry.md) · [ROUTES](reference/routes.md) · [EntitlementMask](reference/entitlement-mask.md) · [FlagRegistry](reference/flag-registry.md)
- [Visibility](../../../docs/opinions/visibility.md) — the four mechanisms and the order they resolve in
- [`@loadbearing/core`](../../core/docs/index.md) — the layer below
