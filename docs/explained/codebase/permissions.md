---
title: Permissions
description: Every permission, menu gate, URL and flag and the yes-or-no logic, shared by server and browser.
---

# Permissions

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The vocabulary of access, shared by the server and the browser so both give the same answer.

It declares every permission (for example `member.invite`), the menu sections each permission unlocks (modules and gates), the URL of every page (routes), the feature flags, and the logic that turns a person's grants into a yes or no (`CapabilitySet`). It has no database code: who holds what is stored elsewhere and passed in.

The rules it enforces: deny by default, a denial always beats a grant, the plan filters what roles grant, and platform (super admin) permissions only come from the platform organization.

| | |
|---|---|
| Folder | `packages/permissions/` |
| Files | 53 |
| Uses | nothing else in the workspace |
| Used by | [Contracts](contracts.md), [Content](content.md), [Application (the business logic)](application.md), [Infrastructure (the real adapters)](infrastructure.md), [Auth](auth.md), [Composition (the wiring)](composition.md), [API server](api-server.md), [UI (the design system)](ui.md), [Feature (the screens' building blocks)](feature.md), [The web app](app-web.md), [The worker](app-worker.md) |

## Every file

### `packages/permissions/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/permissions/src/`

| File | What it does |
|---|---|
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/permissions/src/capability/`

| File | What it does |
|---|---|
| `capability-set.ts` | `CapabilitySet`: what one person may do in one organization, resolved from their roles. Deny by default; a denial always beats a grant; the `core` permissions everyone holds; platform permissions only from the platform organization. `can()` answers the question; it also turns into a plain object (DTO) to send to the browser. |
| `entitlement-mask.ts` | `EntitlementMask`: what an organization's plan allows, applied as a filter over what its roles grant. Grants are hidden, never deleted, so upgrading the plan restores them at once. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/permissions/src/catalog/`

| File | What it does |
|---|---|
| `ai.permissions.ts` | Permissions for document upload and AI search (`ai.embedding.*`), including the ones the background worker holds. |
| `apikey.permissions.ts` | Permissions to list, create and revoke API keys. |
| `core.permissions.ts` | The `core` permissions every signed-in person holds automatically, such as opening the live update stream. |
| `doc.permissions.ts` | Docs permissions: reading, writing drafts, publishing, and managing spaces. Holding one is necessary but not always enough; the space's audience also decides. |
| `index.ts` | `CATALOG`: every permission in the system, merged from the per-area files beside it. |
| `member.permissions.ts` | Permissions for members: list, invite, change role, deactivate. |
| `notification.permissions.ts` | Notification permissions: read the inbox, mark as read, read archived notifications. |
| `platform.permissions.ts` | The super admin permissions (`platform.*`): one per platform screen and action (accounts, plans, flags, status, docs and more). All have the `platform` scope, so no customer organization's owner can ever hold them. |
| `rbac.permissions.ts` | Role and permission management: reading and editing roles, and per-person overrides. |

### `packages/permissions/src/flag/`

| File | What it does |
|---|---|
| `index.ts` | `FLAGS`: every feature flag, merged from per-area files. In the small kit the list is empty. |

### `packages/permissions/src/gate/`

| File | What it does |
|---|---|
| `doc.gate.ts` | Menu gate: show the Docs entry to people who may read docs. |
| `document.gate.ts` | Menu gate: show the Documents (AI search) entry to people who may search documents. |
| `index.ts` | `GATES`: every menu entry and the permission that shows it, merged from the per-area files. |
| `notification.gate.ts` | Menu gate: show Notifications to people who may read them. |
| `platform.gate.ts` | Menu gate: show the Platform entry to anyone holding the permission for at least one platform page. |
| `rbac.gate.ts` | Menu gate: show the roles and members settings to people who may read roles. |

### `packages/permissions/src/registry/`

| File | What it does |
|---|---|
| `flag-registry.ts` | `FlagRegistry`: looks up a flag's declaration (owner, expiry, description). Flags are declared in code and switched on or off in the database. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `module-registry.ts` | `ModuleRegistry`: which menu sections (modules) a person sees, given their permissions. |
| `permission-registry.ts` | `PermissionRegistry`: looks up a permission key's details (its module, its scope, what it depends on) and lists keys by module or scope. |

### `packages/permissions/src/route/`

| File | What it does |
|---|---|
| `account.routes.ts` | URL paths for the account settings pages. No permission needed beyond being signed in. |
| `doc.routes.ts` | URL paths for docs: `/doc/...` for an organization's own docs behind sign-in, and `/docs/...` for the platform's public and granted docs, readable without signing in. |
| `document.routes.ts` | URL path for the documents (AI search) page. |
| `index.ts` | `ROUTES`: the one table of every URL path in the app, read by the web app, the menu and the guards. Also re-exports the platform page-to-permission map. |
| `notification.routes.ts` | URL paths for the notification inbox and preferences. |
| `organization.routes.ts` | URL path for founding a new organization. |
| `platform.routes.ts` | URL paths for every super admin page, and `platformRoutePermission`: the permission each page requires, shared by the page guard and the platform menu so they cannot disagree. |
| `rbac.routes.ts` | URL paths for roles and members settings. |
| `shell.routes.ts` | App-level URL paths no feature owns: home, sign-in, sign-up, password reset, the dashboard, forbidden. |

### `packages/permissions/tests/capability/`

| File | What it does |
|---|---|
| `capability-set.spec.ts` | Tests `capability-set.ts`. |
| `entitlement-mask.spec.ts` | Tests `entitlement-mask.ts`. |

### `packages/permissions/tests/registry/`

| File | What it does |
|---|---|
| `flag-registry.spec.ts` | Tests `flag-registry.ts`. |
| `module-registry.spec.ts` | Tests `module-registry.ts`. |
| `permission-registry.spec.ts` | Tests `permission-registry.ts`. |

### `packages/permissions/tests/route/`

| File | What it does |
|---|---|
| `route.spec.ts` | Tests that every menu gate points at a URL path that still exists. |

### `packages/permissions/docs/`

| File | What it does |
|---|---|
| `index.md` | The shared authorization kernel — one permission vocabulary, one resolution algorithm, one nav-gate map, running identically on server, browser, worker, and desktop. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/permissions/docs/reference/`

| File | What it does |
|---|---|
| `capability-set.md` | CapabilitySet — deny-by-default permission resolution, the five rules, and why intersect() is the method an RBAC model gets quietly defeated through. |
| `entitlement-mask.md` | EntitlementMask — what an org's plan allows, as a filter over role grants rather than a deletion of them, and the four rules for which key survives. |
| `flag-registry.md` | FlagRegistry — flags declared in code with an owner and an expiry, switched in Postgres, none declared in lite, and a client-gating set that is empty until widgets are ported back. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `module-registry.md` | ModuleRegistry — nav gates as a second registry, why content may name a module but never a permission, and the gate barrel missing from the build doc. |
| `permission-registry.md` | PermissionRegistry — the permission vocabulary, the fragmented catalog behind it, and why isKnown() uses Object.hasOwn rather than the `in` operator. |
| `platform-scope.md` | A third axis above the tenant — the four leak paths it closes, why the tier is an organization run like any other, the guards that protect its admins, and why the first admin comes from a script rather than the API. |
| `routes.md` | ROUTES — one human-readable table of destinations, why a generated route tree cannot be the source, and how web, desktop, and the Nest API each resolve against it. |
