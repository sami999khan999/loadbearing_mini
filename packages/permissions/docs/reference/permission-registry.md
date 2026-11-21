---
title: permission-registry
description: PermissionRegistry — the permission vocabulary, the fragmented catalog behind it, and why isKnown() uses Object.hasOwn rather than the `in` operator.
---

# `PermissionRegistry`

The vocabulary: a frozen catalog of keys, each with its scope, module and label.

```ts
export type PermissionScope = "org" | "goal" | "platform";

export interface PermissionMeta {
  readonly scope: PermissionScope;
  readonly module: string;
  readonly label: string;
}

export type PermissionKey = keyof typeof CATALOG;

export class PermissionRegistry {
  public static readonly instance: PermissionRegistry;

  public all(): readonly PermissionKey[];
  public meta(key: PermissionKey): PermissionMeta | undefined;
  public scopeOf(key: PermissionKey): PermissionScope | undefined;
  public byModule(module: string): readonly PermissionKey[];
  public isKnown(value: string): value is PermissionKey;
  public modules(): readonly string[];
}
```

`instance` is `static readonly` and stateless (satisfying the static-mutable-state ban); the singleton
just saves constructing one per call site.

---

## Why `Object.hasOwn` and not `in`

`isKnown()` is the boundary between untrusted strings (role grants, overrides, API-key scopes from the
database) and the typed vocabulary; a stale row must never grant what the registry no longer defines.
The obvious version does:

```ts
public isKnown(value: string): value is PermissionKey {
  return value in CATALOG;   // ← accepts "toString", "constructor", "valueOf", "hasOwnProperty"
}
```

> [!CAUTION]
> **`in` walks the prototype chain** — `CATALOG` inherits `Object.prototype`, so
> `"constructor" in CATALOG` is `true` (verified by a failing test).

A `role_permissions` row reading `constructor` then passes `isKnown()`, lands in a grant set, and:
`scopeOf("constructor")` is `undefined`; `undefined === "goal"` is false, so `can()` takes the org
branch; the org branch finds it in the grants and returns **`true`**. A nonexistent permission is
granted. `Object.hasOwn(CATALOG, value)` checks own properties only. `all()`, `byModule()` and
`modules()` were unaffected — they use `Object.keys`.

### The same input crashed instead of granting

Reading `CATALOG[key].scope` blind made an undefined key a `TypeError`:

```
can("task.archive") → TypeError: Cannot read properties of undefined (reading 'scope')
```

The trigger is a deploy, not an attack: delete a key and `CapabilityCache` serves pre-deletion DTOs for
up to sixty seconds — **500s instead of 403s**, and `ModuleRegistry.visibleModules()` takes the nav down.
So `meta()` and `scopeOf()` return `| undefined` and `can()` treats that as a denial — for the runtime
paths the type cannot see (a cast, or a DTO outliving its key).

### Derived views are computed once

`all()`, `modules()` and the `byModule()` grouping are built at module load and returned frozen
(`registry.all() === registry.all()`), since `visibleModules()` and the permission matrix call them per
render. They are module-level consts, not `static readonly` members holding a `Map` — the exact shape
the static-mutable-state ban catches.

---

## The catalog is fragmented

One `CATALOG` object conflicts on every PR once three teams edit it, so keys live in team-owned fragments
merged by a platform-owned barrel:

```ts
// src/catalog/rbac.permissions.ts — the only fragment the starter kit ships
export const rbacPermissions = {
  "rbac.role.read": { scope: "org", module: "rbac", label: "View roles" },
  // ...
} as const satisfies Record<string, PermissionMeta>;

// src/catalog/index.ts — changes only when a module is added
export const CATALOG = {
  ...rbacPermissions,
  // ...taskPermissions,
} as const;
```

`satisfies` checks each entry without widening; `as const` keeps keys literal, so
`keyof typeof CATALOG` is exactly the catalog's keys. Both survive the spread:

```ts
caps.can("rbac.role.reed");
// TS2820: Type '"rbac.role.reed"' is not assignable to ...
//         Did you mean '"rbac.role.read"'?
```

The fragment imports `PermissionMeta` from the registry, which imports `CATALOG` — a cycle on paper
only, since the fragment's `import type` is erased by `verbatimModuleSyntax`.

---

## Scope is a property of the permission, not of the check

`goal.create` would be org-scoped (the goal does not exist yet); `goal.update` goal-scoped (it acts on
one). Getting this backwards is the common modelling error: `can()` returns `false` for someone who
should obviously have access, because a goal-scoped key was asked without a `goalId` and rule 3 failed
closed. Every shipped key is org- or platform-scoped, which is why
[`capability-set.spec.ts`](capability-set.md) stubs `scopeOf` to exercise the goal branch.

---

## `requires` and its mirror

Some keys are useless alone: `member.invite` opens a form whose role picker reads `role.list`, so
without role read the picker is empty and the button fails. A key names its needs:

```ts
"member.invite": { …, requires: ["member.read", "rbac.role.read"] },
```

A write key requires its read key, and a key whose screen reads another subject requires that read key;
every requirement shares the key's scope, and the spec checks both.

| Method | Answers | Used when |
|---|---|---|
| `closure(keys)` | the keys plus everything they need, transitively | an add: a plan, an adjustment, a per-user grant |
| `dependentClosure(keys)` | the keys plus everything that needs them | a remove or a deny, so no key is left held and unusable |

**Closed on write only** — applying it on read would strip access from existing roles on deploy (every
role with `member.invite` but not `rbac.role.read` would lose invite). `requires` is
`readonly string[]`, not `PermissionKey[]`, because the typed form is circular (TS7022); entries are
narrowed through `Object.hasOwn(CATALOG, …)` once at module load.

## Never delete a key

> [!IMPORTANT]
> A key is never deleted, only stopped being granted — deleting it makes `isKnown()` reject existing
> `role_permissions` rows. Remove the grants in a migration first, the key in a later release.

---

## See also

- [`@loadbearing/permissions`](../index.md)
- [CapabilitySet](capability-set.md) — the only caller of `scopeOf()`
- [ModuleRegistry](module-registry.md) — the same fragment pattern for nav gates
- [`@loadbearing/tsconfig` · base](../../../../tooling/tsconfig/docs/reference/base.md) — where `verbatimModuleSyntax` comes from
