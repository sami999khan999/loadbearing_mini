---
title: "@loadbearing/query"
description: The single TanStack owner — cache keys, the client factory, the provider, and one mutation hook that makes invalidation declarative. Session state lives in the same cache as everything else.
---

# `@loadbearing/query`

**`api-client` is how to reach the server; `query` is how to cache what comes back.** The first changes
with the backend, the second with product behaviour.

**This is the only package that imports `@tanstack/*`:**

```bash
grep -rn "@tanstack" packages/*/src | grep -v "packages/query"
```

returns nothing — scoped to `src/` because `import.ts` governs the shipped surface (a spec imports its
harness directly; `feature`'s harness mounts a real `QueryClientProvider`). The mirror holds too:

```bash
grep -rn "@tanstack/react-router" packages/query/src
```

is empty. Routing stays in `apps/web`, so the Tauri shell can reuse everything above.

| | |
| --- | --- |
| **Package** | `@loadbearing/query` (private, never published) |
| **Entrypoint** | `src/index.ts` — opens with `"use client"` |
| **Depends on** | `@loadbearing/api-client`, `@loadbearing/errors`, `@tanstack/react-query` |
| **Peers** | `react`, `react-dom` — never dependencies |
| **Used by** | `feature`, `apps/web`. **Not** `apps/worker` — it calls use-cases in-process |

```
packages/query/src/
├── index.ts                        ← "use client" on line 1
├── import.ts                       ← every external symbol. The router package is not on it
├── key/
│   ├── index.ts
│   └── query-key.ts                → QueryKeys
├── runtime/
│   ├── index.ts
│   ├── query-client.ts             → createQueryClient, QueryClientOptions, QueryRuntime
│   ├── api-client.context.tsx      → ApiClientProvider, useApiClient
│   ├── use-app-mutation.ts         → useAppMutation, AppMutationOptions
│   └── use-app-query.ts            → useAppQuery
├── session/                        ── one subject folder per slice
│   ├── index.ts
│   ├── session.queries.ts          → SessionQueries
│   └── session.mutations.ts        → SessionMutations
├── account/
│   ├── index.ts
│   ├── account.queries.ts          → AccountQueries
│   └── account.mutations.ts        → AccountMutations
├── member/
│   ├── index.ts
│   ├── member.queries.ts           → MemberQueries
│   └── member.mutations.ts         → MemberMutations
├── organization/
│   ├── index.ts
│   └── organization.mutations.ts   → OrganizationMutations
├── platform/
│   ├── index.ts
│   └── platform.queries.ts        → PlatformQueries
└── rbac/
    ├── index.ts
    ├── role.queries.ts             → RoleQueries
    └── role.mutations.ts           → RoleMutations
```

`key/` and `runtime/` are role folders (one of each), the rest subject folders (one per slice) — the
split [`contracts`](../../contracts/docs/index.md) has.

> [!IMPORTANT]
> **The barrel opens with `"use client"`, as only `ui`, `query` and `feature` may.** They are hooks and
> components end to end; Next's App Router treats modules as Server Components until told otherwise, so
> a Next page importing from here would fail the build (Vite and TanStack Start ignore it).
> **Verified:** `head -1 dist/index.js` is `"use client";` — esbuild has dropped top-level directives
> before, and that regression would break Next silently, at the consumer.

## `createQueryClient` is a factory, and that is a correctness boundary

| Entry point | Lifetime | Why |
| --- | --- | --- |
| `apps/web` SSR | **one per request** | A shared instance serves user A's cached data to user B. Under this permission model that is a cross-tenant leak, not a caching bug |
| `apps/web` browser | one singleton | Normal client behaviour |
| Tauri webview | one singleton | No SSR, so no per-request concern |

A module-scope `new QueryClient()` in a server bundle is shared across concurrent requests — and **works
perfectly in development, with one user**. See [`lifetime.md`](reference/lifetime.md).

It takes a **constructed** `ApiClient`, never a base URL, so the server can hand it an in-process
transport and the browser an HTTP one:

```ts
// apps/web/src/router.tsx — the plugin removes the branch that does not apply,
// along with its imports, which is what keeps the container out of the browser.
const transport = createIsomorphicFn()
  .client(() => ApiClient.overHttp(Endpoint.rpc, new CookieAuthStrategy()))
  .server(() => ApiClient.inProcess(createServerRpcClient(getRequest())));
```

**The server branch is not an optimisation:** `Endpoint.rpc` is relative, unresolvable under Node, so
SSR `ensureQueryData` through HTTP fails outright — why `ApiClient.overHttp` refuses a relative base
outside a browser ([`api-client`](../../api-client/docs/index.md)). `createQueryClient` is an exported
function, which the OOP rule would reject; `packages/query` is outside that ESLint block because a
React-idiom factory wrapped in a class would be cargo cult.

## Two defaults that are decisions

- **`retry` reads the error catalog.** Retryability is declared once in
  [`errors`](../../errors/docs/index.md): `FORBIDDEN` never retries; `RATE_LIMITED` and `UNAVAILABLE` at
  most twice. Retrying a permission failure turns an instant "you cannot do that" into a three-second
  wait and triples a stuck client's load. Unknown throws normalise to `INTERNAL` first, so they still
  get a catalog answer.
- **`refetchOnWindowFocus: false`** — every refetch is an authenticated round trip with a capability
  resolution, so freshness is opt-in per query.

## Keys are never written at a call site

```ts
QueryKeys.rbac.effective("u1")   // ["rbac", "effective", "u1"]
```

- **Keys mirror the procedure path, parameters last** — `contract.task.list` is
  `["task", "list", params]`, derivable without looking anything up.
- **Every namespace has `all()`**; TanStack matches by prefix, so one call catches every list and detail
  below. Centralised keys make invalidation trustworthy — widening what reactivation invalidates is one
  method, not a grep.
- **Parameters go in an object** — `["task", "list", { goalId, status }]`, so adding a filter does not
  shift every key and invalidate the namespace on deploy.

## `useAppQuery` exists so that grep can keep returning nothing

```ts
export function useAppQuery<TQueryFnData, TError, TData, TQueryKey extends QueryKey>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): UseQueryResult<TData, TError> {
  return useQuery(options);
}
```

A pure pass-through that earns its place by existing: [`feature`](../../feature/docs/index.md) reads
through it, so no feature slice names the cache library. **Nothing else may go in it** — all four
generics infer from the one argument, and any default (retry, `staleTime`, options merge) moves the
inference site so every call site's `data` becomes `unknown`. Per-query defaults go in the
`queryOptions` factory, global ones in `createQueryClient`; a type-level spec pins both.

## Invalidation is declared

```ts
useAppMutation({ mutationFn: …, invalidates: [QueryKeys.task.all(), QueryKeys.rbac.all()] })
```

A mutation states *what it affects* and the hook invalidates, before the caller's `onSuccess` — so
"what does this affect" has one answer and a new dependent panel is a one-line edit. Details:
[mutations](reference/mutations.md).

## Session lives in this cache, not a second one

`SessionQueries.current(auth)` returns `queryOptions` keyed `["session"]` — why `api-client` wraps
Better Auth's **vanilla** client. `better-auth/react`'s `useSession` keeps its own cache, and when the
two disagree (reliably, on sign-out) the UI shows a signed-in shell around `UNAUTHORIZED` responses.
**Sign-out clears the whole cache at the call site** via `useSignOut`'s `onDone`:

```ts
const signOut = SessionMutations.useSignOut(auth, () => {
  queryClient.clear();
  navigate({ to: "/sign-in" });
});
```

See [mutations](reference/mutations.md#sign-out-and-switch-clear-the-cache-at-the-call-site). Static
hook factories are fine: hook rules apply at the call site, and each is called unconditionally at the top
of a component.

## What a backend swap costs here

Keys and options never name a transport.

| Scenario | Changes in this package |
| --- | --- |
| TanStack Start + oRPC (today) | — |
| NestJS + oRPC | nothing — `ApiClient` swaps its link |
| NestJS + plain REST | nothing — `ApiClient` gets a REST transport |
| Tauri desktop | imports it unchanged |
| `apps/worker`, a CLI | does not import it at all |

**SSR router integration stays in `apps/web`** — `routerWithQueryClient` needs the forbidden router
package, so `query` exports the factory and the app wires it, deliberately: routing is what the desktop
shell replaces.

## `rbac` keys

`roles(params)` is read by `RoleQueries.list` and written through by all five `RoleMutations`;
`effective(userId)` is read by `EffectivePermissionsInspector` when inspecting someone else. **`useGrant`
and `useRevoke` also invalidate `QueryKeys.member.all()`**, since a grant changes the inspector's answer
for every member with that role. `QueryKeys.task` stays illustrative: there is no task contract.

## Reference

- [Client lifetime](reference/lifetime.md) — why `createQueryClient` is a factory.
- [Mutations and invalidation](reference/mutations.md) — invalidate-before-`onSuccess`, the three states
  of `invalidates`, optimistic edits, cursor pages.
- [Realtime](reference/realtime.md) — one stream per tab, a total routing table, and why a frame
  invalidates rather than patches.
