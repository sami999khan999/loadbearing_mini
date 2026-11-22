---
title: Lifetime
description: Why the query client is a factory, the provider is context, and neither is a module singleton — the same rule the container and the message store follow, for the same reason.
---

# Factories, context, and the singleton that leaks

```ts
export function createQueryClient(options: QueryClientOptions): QueryRuntime
```

A function, not `export const queryClient = new QueryClient(...)` — a difference visible only in
production, on the second concurrent request.

## The failure, precisely

A module-scope `QueryClient` in a server bundle is per **process**, shared by every request, and keys
look like `["rbac", "effective", userId]`:

1. User A's request populates `["session"]` and a dozen tenant-scoped keys.
2. User B's request arrives on the same process, hits the same client, and finds them fresh.
3. Nothing refetches, because `staleTime` has not elapsed.

**A cross-tenant read, not a caching bug** — no error, a valid render of someone else's data, and
perfect in development with one user.

## Three lifetimes, one factory

| Entry point | Instances | Reason |
| --- | --- | --- |
| `apps/web` SSR | one per **request** | The failure above |
| `apps/web` browser | one singleton | One user per browser; the cache is theirs |
| Tauri webview | one singleton | No SSR, so no shared-process concern |

One definition; what differs is *when* it is called — once at browser startup, per request on the
server beside the per-request `ApiClient`.

## The provider is context for the same reason

```ts
const ApiClientContext = createContext<ApiClient | null>(null);
```

`useApiClient` reads context because SSR and browser instances are **different objects with different
transports** (in-process vs HTTP); a module import cannot be both. It throws without a provider — a
named wiring error beats `undefined` in a `queryFn`.

## The same rule, three times in this repository

Not a React idiom but one rule about request-scoped state in long-lived processes:

| Thing | Rule | Where |
| --- | --- | --- |
| `QueryClient` | one per request on the server | here |
| `Container` | one per **process**, and it holds no request state — the `Principal` is an argument to `execute()` | [`composition`](../../../composition/docs/reference/container.md) |
| `MessageStore` | one per request; a module-scope store serves one user's locale to the next | [`content`](../../../content/docs/index.md) |

The container is *deliberately* a process singleton, holding only per-request-invariant things (pool,
clock, authorizer); put something per-request on it and it inherits the failure — the mirror image of
this page ([container rules](../../../composition/docs/reference/container.md)). **The regression
check** is not a unit test (a reintroduced singleton would pass one) but the written rule plus
`grep -rn "new QueryClient" packages apps` returning one hit, inside this factory.

## `staleTime` is the blast radius

The two defaults interact, and it is worth seeing why:

```ts
staleTime: 30_000,
gcTime: 5 * 60_000,
```

On a leaked singleton `staleTime` is *how long the wrong tenant's data is served*; `gcTime` how long
unused entries live. Neither is the fix — shortening them costs round trips and fixes nothing; the
lifetime is the answer.
