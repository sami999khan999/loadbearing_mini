---
title: rules
description: The blocks in the config — ignores, typed rules, the OOP shape assertions, the two bans that need type-import nuance, and the lazy() ban.
---

# Rules

One config, four blocks, each scoped by `files` (replacing the old `base`/`oop`/`react` presets).

---

## Block 1 — `ignores`

```js
ignores: [
  "**/dist/**",
  "**/.output/**",
  "**/migrations/**",
  "**/*.config.ts",
  "**/*.config.mts",
  "**/*.d.ts",
];
```

`dist`, `.output` and `migrations` are generated. The other three **sit outside every tsconfig
`include`, so `projectService` cannot resolve them and type-aware rules fail with a parsing error.**

> [!IMPORTANT]
> `**/*.config.ts`, not `*.config.*` — the wider glob matches `eslint.config.js` itself, and editors
> report _"File ignored because of a matching ignore pattern"_ on every config. The leading `**/`
> matters: flat-config ignores resolve against the config's directory, so bare `dist/**` misses
> `packages/core/dist/`.

---

## Block 2 — typed rules

```js
files: ["packages/*/src/**/*.{ts,tsx}", "apps/*/src/**/*.{ts,tsx}"],
extends: [...tseslint.configs.recommendedTypeChecked],
languageOptions: { parserOptions: { projectService: true } },
```

`projectService` finds each file's `tsconfig.json`, so a new package needs no lint config.

### `no-floating-promises` and `no-misused-promises`

The two rules that justify type-aware linting. A missing `await` on a `.save()` returns `200` with the
write in flight (or lost on exit), and no test or reviewer reliably catches it.

> Biome's type-aware `noFloatingPromises` does not use `tsc`; if it holds here, dropping these and the
> `recommendedTypeChecked` extend removes most of ESLint's slowness.

### `require-await`

An `async` function that never awaits is usually an unfinished signature change. `ContentSource`'s
await-free `async` methods (kept so a CMS needs no call-site change) satisfy an abstract signature and
do not trip it.

### `parameter-properties`

```js
["error", { prefer: "parameter-property" }];
```

**No Biome equivalent** — Biome's `noParameterProperties` bans the form; nothing requires it.

```ts
// ✗ rejected
class ReactivateTaskUseCase {
  private readonly tasks: TaskRepository;
  constructor(tasks: TaskRepository) {
    this.tasks = tasks;
  }
}

// ✓ required
class ReactivateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}
}
```

A class's dependencies read as one list in its signature — what checking the hand-written DI wiring
relies on.

> [!IMPORTANT]
> Parameter properties emit runtime code, so Node's type stripping (`node file.ts`) **cannot** run this
> codebase — `apps/worker` uses `tsx`, which transpiles. Revisiting means `erasableSyntaxOnly: true` and
> rewriting every constructor.

### `prefer-readonly`

Private fields never reassigned say so, making the mutable ones visible.

### The three `"off"` entries

`no-explicit-any`, `no-unused-vars`, `consistent-type-imports` — Biome owns all three (`noExplicitAny`,
its unused-variable rule, `useImportType`); both on would double-report.

---

## Block 3 — the OOP shape rules

```js
const OOP_PACKAGES = [
  "packages/{core,permissions,contracts,application,db,infrastructure,auth,composition,api-client,asset,content}/src/**/*.ts",
];
```

**The only place the React/non-React split is written.** `query`, `ui`, `feature` and `apps/*` are
excluded — components and hooks are functions by contract. Four `no-restricted-syntax` selectors cover
the three ways a function escapes a module, plus static mutable state:

```ts
// ✗ wrong — behaviour floating free of the data it operates on
export function canReactivate(caps: CapabilitySet, taskId: string) { … }

// ✓ right — behaviour belongs to the thing that has the data
class CapabilitySet {
  public can(permission: PermissionKey, goalId?: string): boolean { … }
}
```

Free functions lose a codebase its shape: `canReactivate` lands in utils, gets copied for a variant,
and two answers to one permission question drift. A method cannot be copied without its class — which
matters because `CapabilitySet.can()` must be *one* implementation shared by the oRPC handler, `<Can>`,
the route guard and the worker.

### The static-mutable-state ban

```js
selector: "ClassBody > PropertyDefinition[static=true][readonly!=true]";
```

> [!WARNING]
> A real production bug, not a smell: `static cache = new Map()` on a repository passes every test and
> under concurrency serves user A's rows to user B — a cross-tenant leak where row visibility is the
> permission model.

`static readonly` passes; the gap is a `static readonly Map` (readonly binding, mutable map).

### What deliberately does not trip these

| Pattern | Why it passes |
| --- | --- |
| Zod schemas | `static readonly` class members |
| Drizzle tables | a `pgTable` call expression, not an arrow function |
| Permission fragments | an object literal |
| Contract routers | an object literal, and oRPC's inference needs the literal shape |

Data shapes, not behaviour — the selectors target function declarations and arrows so declarative
exports stay legal. Biome's `noStaticOnlyClass` is `off` because `Uuid`, `Identifiers`,
`ProcedurePermissions` and `PermissionRegistry` are deliberate static namespaces with a
`private constructor()`.

---

## Block 4 — bans needing type-import nuance

Two bans Biome cannot express.

### `packages/feature` — the `api-client` and router bans

```js
files: ["packages/feature/src/**/*.{ts,tsx}"],
rules: {
  "no-restricted-imports": "off",
  "@typescript-eslint/no-restricted-imports": ["error", { paths: [
    { name: "@loadbearing/api-client", allowTypeImports: true, message: "…" },
    { name: "@tanstack/react-router",  allowTypeImports: true, message: "…" },
  ]}],
}
```

> [!IMPORTANT]
> **Biome's `noRestrictedImports` flags `import type` like a value import**, with no exemption
> (verified on 2.5.7), so it would error on `SignInForm`'s runtime-free
> `import type { AuthClient } from "@loadbearing/api-client"`. The core ESLint rule shares the limit and
> is `"off"`, or it fires and the exemption never applies.

The first ban stops a deadline-pressure `await client.task.list()` in a component — a read no mutation
will ever refresh. The second lets a Tauri webview mount `feature` under a different routing shell.

### `packages/content` — the `PermissionKey` ban

`content` may import `ModuleKey` from `@loadbearing/permissions` but never `PermissionKey` or
`PermissionRegistry` — a **named-export** ban Biome cannot express. Nav items carry `module: "rbac"`,
never `permission: "rbac.role.read"`; a permission content field would make a CMS edit a privilege
escalation. **Pattern:** Biome for whole-module bans, ESLint for named-export or type-import nuance.

---

## The `lazy()` ban — `packages/feature` and `apps/web`

```js
files: ["packages/feature/src/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}"],
rules: { "no-restricted-syntax": ["error",
  { selector: "ImportDeclaration[source.value='react'] > ImportSpecifier[imported.name='lazy']" },
  { selector: "CallExpression[callee.type='Identifier'][callee.name='lazy']" },
  { selector: "MemberExpression[object.name='React'][property.name='lazy']" },
]}
```

Rule 9 of [visibility](../../../../docs/opinions/visibility.md): **never lazy-load by permission** —
the bundle is not secret, so it hides nothing and adds a waterfall to the allowed path. No type can hold
it. Three selectors for three spellings: the import (`lazy as load`), a bare `lazy` call, and
`React.lazy`. It costs nothing — route splitting is the router's, and TanStack's `lazyRouteComponent` /
`createLazyFileRoute` pass.

> [!NOTE]
> Neither glob overlaps `OOP_PACKAGES`: flat config replaces rule options rather than merging, so the
> later block would silently drop the other's selectors.

---

## See also

- [Overview](../index.md) — the two-tool split, dependency layout, and bin resolution
