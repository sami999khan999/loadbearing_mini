---
title: ModuleRegistry
description: ModuleRegistry — nav gates as a second registry, why content may name a module but never a permission, and the gate barrel that mirrors the catalog.
---

# `ModuleRegistry`

The permission catalog answers "may this actor do X"; the module registry answers "should they see the
finance section at all" — a different question with a different owner.

**The two module vocabularies differ on purpose.** `PermissionMeta.module` groups the catalog (the first
segment of every `<module>.<subject>.<action>` key; `EffectivePermissionsInspector` renders a section
per value). `ModuleKey` is `keyof typeof GATES`: modules something navigates to. `apikey` is a grouping
module with no gate, as `accountRoutes` has routes with no gate. They drifted once — `member.*` and
`apikey.*` declared `module: "rbac"`, so `byModule("member")` answered nothing and the inspector misfiled
five keys — and a spec now asserts every key opens with its declared module.

```ts
export interface ModuleGate {
  readonly permission: PermissionKey;
  readonly route: AppRoute;
}

export type ModuleKey = keyof typeof GATES;

export class ModuleRegistry {
  public static readonly instance: ModuleRegistry;

  public gate(module: ModuleKey): ModuleGate;
  public isVisible(module: ModuleKey, caps: CapabilitySet): boolean;
  public visibleModules(caps: CapabilitySet): readonly ModuleKey[];
}
```

```ts
ModuleRegistry.instance.visibleModules(caps);        // the modules caps may enter
ModuleRegistry.instance.gate("rbac").route;          // "/settings/roles"
```

## Why this is a separate registry

`@loadbearing/content` owns the menu's labels, order and icons, which an editor may change; an editor
must **not** change which permission gates a module or where it routes. So `nav.data.ts` carries
`module: "finance"`, never `permission: "finance.read.global"`, and `content` may import `ModuleKey` as
a type but never `PermissionKey`. ESLint enforces it for that package alone:

```js
{
  files: ["packages/content/src/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "@loadbearing/permissions",
        importNames: ["PermissionKey", "PermissionRegistry"],
        message: "Content names a module. ModuleRegistry owns which permission gates it.",
      }],
    }],
  },
}
```

> [!WARNING]
> This is the **core** `no-restricted-imports`, with no `allowTypeImports`, so it flags `import type`
> too — harmless while `content` imports only `ModuleKey`, a problem the day someone wants a type-only
> exception.

Folding gates into `PermissionMeta` would put the gating decision in a file a content editor edits.

## `src/gate/` mirrors the catalog

One fragment per slice, merged by a platform-owned barrel:

```ts
import { rbacGates } from "./rbac.gate.js";

export const GATES = {
  ...rbacGates,
  // ...taskGates,
} as const;
```

Fragment ↔ registry imports are `import type` — a cycle on paper only. `as const satisfies
Record<string, ModuleGate>` gives the same typo-safety:

```ts
ModuleRegistry.instance.gate("finance");
// TS2345: Argument of type '"finance"' is not assignable to
//         parameter of type '"rbac" | "member" | …'.
```

`satisfies` also checks each `permission` against `PermissionKey`, and `route` is an `AppRoute` from
[the route table](routes.md), so a gate on a missing permission or path fails to compile:

```ts
rbac: { permission: "rbac.role.read", route: "/settings/rolez" },
// TS2820: Type '"/settings/rolez"' is not assignable to type 'AppRoute'.
//         Did you mean '"/settings/roles"'?
```

## `visibleModules()` is a filter, not a policy

It delegates to `CapabilitySet.can()`, so all resolution rules hold — a wildcard holder explicitly
denied a gate's key loses that module:

```ts
const caps = CapabilitySet.from({
  wildcard: true,
  org: { grants: [], denies: ["rbac.role.read"] },
  goals: {},
});

ModuleRegistry.instance.visibleModules(caps); // every module except "rbac"
```

Gates are asked without a `goalId`, so a module gated on a goal-scoped key would be invisible to
everyone, silently. Gate on org- or platform-scoped keys — a checked claim:

```ts
it("gates no module on a goal-scoped permission", () => {
  for (const [module, gate] of Object.entries(GATES)) {
    expect(PermissionRegistry.instance.scopeOf(gate.permission), module).not.toBe("goal");
  }
});
```

The same shape as `contracts`' `ProcedurePermissions` coverage test — a cross-check types cannot express.

## See also

- [`@loadbearing/permissions`](../index.md)
- [CapabilitySet](capability-set.md) — every decision here delegates to `can()`
- [PermissionRegistry](permission-registry.md) — the vocabulary a gate points into
- [ROUTES](routes.md) — the destination table a gate's `route` points into
