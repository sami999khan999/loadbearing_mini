---
title: Query (data fetching and caching)
description: Cached reads and writes for React with TanStack Query, and the live stream in the browser.
---

# Query (data fetching and caching)

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The bridge between the API and React, using TanStack Query. For each area there is a `*.queries.ts` (cached reads, with how long each stays fresh) and a `*.mutations.ts` (writes, with which cached reads each one refreshes, and optional instant updates that roll back on failure).

It also runs the live stream in the browser: one connection per tab, and each event refreshes exactly the cached data it affects.

| | |
|---|---|
| Folder | `packages/query/` |
| Files | 67 |
| Uses | [API client](api-client.md), [Contracts](contracts.md), [Errors](errors.md) |
| Used by | [Feature (the screens' building blocks)](feature.md), [The web app](app-web.md) |

## Every file

### `packages/query/`

| File | What it does |
|---|---|
| `package.json` | Package manifest. |
| `tsconfig.json` | TypeScript settings. |
| `tsup.config.ts` | Build settings. |
| `vitest.config.ts` | Test settings. |
| `vitest.setup.ts` | Runs before the tests: cleans up rendered React components between tests. |

### `packages/query/src/`

| File | What it does |
|---|---|
| `import.ts` | Outside-import surface. |
| `index.ts` | Public entry point. |

### `packages/query/src/account/`

| File | What it does |
|---|---|
| `account.mutations.ts` | `AccountMutations`: React hooks for changing your own account (profile, email, password, two-factor, linked accounts, sessions), and which cached data each one refreshes. |
| `account.queries.ts` | `AccountQueries`: cached reads for your linked accounts and active sessions. |
| `index.ts` | Folder barrel. |

### `packages/query/src/apikey/`

| File | What it does |
|---|---|
| `api-key.mutations.ts` | `ApiKeyMutations`: hooks to create and revoke API keys. The new key's secret is never written into the cache. |
| `api-key.queries.ts` | `ApiKeyQueries`: cached read for the API key list. |
| `index.ts` | Folder barrel. |

### `packages/query/src/doc/`

| File | What it does |
|---|---|
| `doc.mutations.ts` | `DocMutations`: hooks for every docs write (create, save, publish, move, delete pages; create, update, delete spaces; grants; restore; preview; image upload) and which cached reads each one refreshes. |
| `doc.queries.ts` | `DocQueries`: cached reads for docs: a page as a reader sees it, the sidebar (keyed by the space's version so it never goes stale), the editor's tree and draft, revisions, spaces, grants, access options and search. |
| `index.ts` | Folder barrel. |

### `packages/query/src/document/`

| File | What it does |
|---|---|
| `document.mutations.ts` | `DocumentMutations`: hooks to queue a document for indexing and to search. |
| `index.ts` | Folder barrel. |

### `packages/query/src/key/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `query-key.ts` | `QueryKeys`: every cache key, mirroring the API path with parameters last. Each area has `all()`, so one call refreshes everything under it. |

### `packages/query/src/member/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `member.mutations.ts` | `MemberMutations`: hooks to invite, resend, revoke, change role, deactivate and reactivate. |
| `member.queries.ts` | `MemberQueries`: cached reads for members and invitations. |

### `packages/query/src/notification/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `notification.mutations.ts` | `NotificationMutations`: hooks to mark notifications read (instantly on screen) and save preferences. |
| `notification.queries.ts` | `NotificationQueries`: cached reads for the inbox (infinite scroll), the unread count, archived months and preferences. |

### `packages/query/src/organization/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `organization.mutations.ts` | `OrganizationMutations`: hooks to switch, create and join organizations. The whole cache is dropped afterwards, since it belonged to the organization being left. |

### `packages/query/src/override/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `override.mutations.ts` | `OverrideMutations`: hooks to grant, deny and clear per-person exceptions. |
| `override.queries.ts` | `OverrideQueries`: cached read for one member's exceptions. |

### `packages/query/src/platform/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `platform.mutations.ts` | `PlatformMutations`: hooks for every super admin action (plans, entitlements, accounts, flags, modules, exports, deletes and, in the big kit, retention, projection, replica and moves). |
| `platform.queries.ts` | `PlatformQueries`: cached reads for every super admin screen, with short refresh times for health and none for "what would this destroy" previews. |

### `packages/query/src/rbac/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `role.mutations.ts` | `RoleMutations`: hooks to create, rename, delete roles and grant or revoke permissions. |
| `role.queries.ts` | `RoleQueries`: cached reads for roles, the plan ceiling and someone's effective permissions. |

### `packages/query/src/realtime/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `realtime-refetch.ts` | `RealtimeRefetch`: when live messages arrive in a burst, refetches each affected cache entry at most once a second. |
| `realtime-route.ts` | `RealtimeRoutes`: the table from each live event name to the cached data it makes stale. Live events never carry data to show; they say what to refetch. |
| `realtime-stream.ts` | `RealtimeStream`: keeps the live stream open, reconnecting with growing delays and resuming from the last message seen. |
| `realtime.context.tsx` | `RealtimeProvider` and `useRealtime`: opens one live stream per browser tab for the current organization and refreshes cached data as events arrive. |
| `use-realtime-event.ts` | `useRealtimeEvent`: lets a component react to a live event directly (for example the typing indicator). |

### `packages/query/src/runtime/`

| File | What it does |
|---|---|
| `api-client.context.tsx` | `ApiClientProvider` and `useApiClient`: makes the API client available to components (a different one on the server and in the browser). |
| `index.ts` | Folder barrel. |
| `query-client.ts` | `createQueryClient`: makes a fresh TanStack Query cache, one per request on the server so organizations never share one. Only retries errors the catalog marks retryable. |
| `use-app-infinite-query.ts` | `useAppInfiniteQuery`: a thin wrapper so feature code can read paged lists without importing the cache library. |
| `use-app-mutation.ts` | `useAppMutation`: the wrapper every write hook uses: runs the call, optionally updates the screen before the server answers (and rolls back on failure), then refreshes the listed cache keys. |
| `use-app-query.ts` | `useAppQuery`: a thin wrapper so feature code can read cached data without importing the cache library. |

### `packages/query/src/session/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `session.mutations.ts` | `SessionMutations`: hooks for signed-out actions: sign up, sign in, two-factor, sign out, password reset, verify email. |

### `packages/query/tests/declaration/`

| File | What it does |
|---|---|
| `mutation-declaration.spec.ts` | Tests that each write hook calls the right endpoint and refreshes the right cache keys. |
| `query-declaration.spec.ts` | Tests that each read hook uses the right key and refresh time. |

### `packages/query/tests/key/`

| File | What it does |
|---|---|
| `query-key.spec.ts` | Tests `query-key.ts`. |

### `packages/query/tests/realtime/`

| File | What it does |
|---|---|
| `realtime-refetch.spec.ts` | Tests `realtime-refetch.ts`. |
| `realtime-route.spec.ts` | Tests `realtime-route.ts`. |
| `realtime-stream.spec.ts` | Tests `realtime-stream.ts`. |
| `realtime.context.spec.tsx` | Tests `realtime.context.tsx`. |

### `packages/query/tests/runtime/`

| File | What it does |
|---|---|
| `query-client.spec.ts` | Tests `query-client.ts`. |
| `use-app-mutation.spec.tsx` | Tests `use-app-mutation.ts`. |
| `use-app-query.spec.ts` | Tests `use-app-query.ts`. |

### `packages/query/docs/`

| File | What it does |
|---|---|
| `index.md` | The single TanStack owner — cache keys, the client factory, the provider, and one mutation hook that makes invalidation declarative. Session state lives in the same cache as everything else. |
| `meta.json` | Sidebar order. |

### `packages/query/docs/reference/`

| File | What it does |
|---|---|
| `lifetime.md` | Why the query client is a factory, the provider is context, and neither is a module singleton — the same rule the container and the message store follow, for the same reason. |
| `meta.json` | Sidebar order. |
| `mutations.md` | Why useAppMutation invalidates before onSuccess, how a declared optimistic edit rolls itself back, why sign-out and organization switch declare no invalidation at all, and the rule for deciding what each mutation invalidates. |
| `realtime.md` | One stream per tab, a total routing table, why every frame refetches rather than patches, how a burst is coalesced, and how a stream reopens — including the short replay and the resync past it. |
