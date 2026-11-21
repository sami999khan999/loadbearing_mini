---
title: routes
description: ROUTES — one human-readable table of destinations, why a generated route tree cannot be the source, and how web, desktop, and the Nest API each resolve against it.
---

# `ROUTES`

One hand-written, readable table of every destination, grouped by slice. `GATES` points into it, every
shell links against it, and a Nest API would prefix it with an origin for deep links.

```ts
export type RoutePath = `/${string}`;

// excerpt — the real table has one group per slice (see src/route/index.ts)
export const ROUTES: {
  readonly shell: { readonly home: "/"; readonly signIn: "/sign-in"; readonly forbidden: "/forbidden" };
  readonly rbac: { readonly roles: "/settings/roles"; readonly members: "/settings/members" };
  // …
};

export type AppRoute = /* the union of every literal path in ROUTES */;
```

```ts
ROUTES.rbac.roles;                             // "/settings/roles"
ModuleRegistry.instance.gate("rbac").route;    // "/settings/roles" — the same literal
```

## Why a generated route tree is not the source

Deriving paths from the router (`RoutePaths<typeof routeTree>`, Next's `typedRoutes`) fails twice:
**it does not exist in most runtimes** — a Nest process has no route tree, and web, desktop and Next each
generate a *different* one — and **nobody reads codegen output**; "what screens does the product have"
should be one file. A generated tree is useful only as a *checker* (below).

## Fragments, one per slice

Like `catalog/` and `gate/`: one team edits one file; the platform barrel gains a line per slice.

```
src/route/
├── index.ts             ← merges fragments, declares RoutePath and AppRoute
├── shell.routes.ts      ← platform-owned: home, sign-in, forbidden
├── rbac.routes.ts       ← team-owned, one per slice
└── …
```

```ts
// rbac.routes.ts
import type { RoutePath } from "./index.js";

export const rbacRoutes = {
  roles: "/settings/roles",
  members: "/settings/members",
} as const satisfies Record<string, RoutePath>;
```

`shell.routes.ts` holds destinations no feature owns. The fragment ↔ barrel import is `import type`, a
cycle on paper only.

## Two things that fail to compile

**A gate pointing at an undeclared path** — `ModuleGate.route` is `AppRoute`:

```ts
rbac: { permission: "rbac.role.read", route: "/settings/rolez" },
// TS2820: Type '"/settings/rolez"' is not assignable to type 'AppRoute'.
//         Did you mean '"/settings/roles"'?
```

**A path without a leading slash** — what `RoutePath` buys:

```ts
roles: "settings/roles",
// TS2322: Type '"settings/roles"' is not assignable to type '`/${string}`'.
```

## How each runtime resolves against it

| Runtime | Needs | Resolves as |
| --- | --- | --- |
| `apps/web` | internal paths | `ROUTES.rbac.roles` directly |
| `apps/desktop` (Tauri) | internal paths | the same, unless its tree diverges |
| `apps/api` (NestJS) | **absolute URLs** | `` `${PUBLIC_WEB_URL}${ROUTES.rbac.roles}` `` |

**Nest is not a shell** — it never navigates, only builds deep links (emails, notifications, OAuth
redirects) pointing at the web app, so it takes an origin, not a table:

```ts
export class DeepLink {
  public constructor(private readonly baseUrl: string) {}

  public roles(): string {
    return `${this.baseUrl}${ROUTES.rbac.roles}`;
  }
}
```

**Tauri changes history mode, not path strings.** A desktop shell owns its route files and hash or
memory history, but nothing forces different spellings; identical paths keep a `feature` `<Link>`
correct in both shells with no branching — treat it as an invariant. If a screen truly must move,
override only those keys:

```ts
// apps/desktop/src/routes.ts
export const DESKTOP_ROUTES = {
  ...ROUTES,
  rbac: { ...ROUTES.rbac, roles: "/roles" },
} as const;
```

New slices then appear untouched and the divergence is one visible diff — but `feature` components can
no longer name `ROUTES.x` for those screens (the path must arrive as a prop), which is the reason to
avoid diverging.

## Verifying a shell actually has these routes

The table can lie: rename `settings/roles.tsx` and it still claims `/settings/roles`. **No check exists
today.** One line per shell, typed against its generated router, would close the gap — the generated tree
checking the readable table, never replacing it:

```ts
// e.g. apps/web/src/route/-nav-routes.ts — nobody reads this, it only has to pass
const _routesExist: Readonly<Record<AppRoute, true>> = /* built from routeTree */;
```

## Parameterised routes

Param syntax is not portable (`/members/$id` vs `/members/[id]`), so store a builder returning a finished
path:

```ts
memberDetail: (id: string) => `/settings/members/${id}`,
```

`AppRoute` uses `Extract<…, string>` so builders do not leak function types into the union. A builder
cannot *declare* the route to a file-based router — each shell still writes its route file, the drift
the check above would catch.

## See also

- [`@loadbearing/permissions`](../index.md)
- [ModuleRegistry](module-registry.md) — `ModuleGate.route` is an `AppRoute` from this table
