---
title: "@loadbearing/api-client"
description: How to reach the server — the typed oRPC client, the auth-strategy seam, and a transport that lets SSR skip the network entirely. React-free, and it has to stay that way.
---

# `@loadbearing/api-client`

**`api-client` reaches the server; [`query`](../../query/docs/index.md) caches what comes back** — two
packages because they change for different reasons.

```bash
grep -rnE "@tanstack|from \"react\"" packages/api-client/src
```

returns nothing — a hard constraint: it must load in plain Node, integration tests and any non-React
host (CLI, script, sidecar). **One React import breaks all of them.**

| | |
| --- | --- |
| **Package** | `@loadbearing/api-client` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/contracts`, plus `@orpc/client`, `@orpc/contract`, `better-auth` |
| **Used by** | `query`, `feature` (type-only), `apps/web` |
| **Environment** | isomorphic — browser, Tauri webview, Node. **No `ServerOnly.assert()`** |

```
packages/api-client/src/
├── index.ts
├── import.ts                             ← every external symbol. Note what is absent
├── client/
│   ├── index.ts
│   └── api-client.ts                     → ApiClient, AppClient
└── auth/
    ├── index.ts
    ├── auth.client.ts                    → AuthClient, AuthClientConfig
    ├── account.client.ts                 → AccountClient, ActiveSession, LinkedAccount,
    │                                       TwoFactorEnrolment
    ├── organization.client.ts            → OrganizationClient, OrganizationSwitch
    ├── better-auth-error-normalizer.ts   → BetterAuthErrorNormalizer, BetterAuthError
    ├── auth.strategy.ts                  → AuthStrategy, RequestCredentials
    ├── bearer-auth.strategy.ts           → BearerAuthStrategy
    ├── cookie-auth.strategy.ts           → CookieAuthStrategy
    └── token.provider.ts                 → TokenProvider

packages/api-client/tests/
├── auth/
│   ├── auth.client.spec.ts
│   ├── auth.strategy.spec.ts
│   ├── better-auth-error-normalizer.spec.ts
│   └── organization.client.spec.ts
└── client/api-client.spec.ts
```

`auth/` **is the whole difference between web and desktop clients**; everything above is identical.

## Two factories, and the one that skips the network

`new ApiClient(baseUrl, auth)` would make every SSR loader an HTTP round trip through the loopback —
six self-requests before a byte renders, competing with real traffic. So the constructor is private:

| Factory | Used by | Transport |
| --- | --- | --- |
| `ApiClient.overHttp(baseUrl, auth)` | browser, Tauri webview, CLI | `RPCLink` over `fetch` |
| `ApiClient.inProcess(rpc)` | SSR loaders in `apps/web` | the router client, directly |

`createQueryClient()` in `query` picks per environment; both satisfy one type, and on client
navigation the same loader picks up the HTTP client.

> [!IMPORTANT]
> **In-process is a transport optimisation, never an authorization shortcut.** `apps/web` passes the real
> request headers in; skipping them breaks auth or tempts a hand-built privileged principal. Same
> middleware and `Authorizer.assert()`; only serialisation is skipped.

## The auth seam

A Tauri webview's `tauri://` origin **never** sends the API's cookie — why `AuthStrategy` exists.

| | `CookieAuthStrategy` | `BearerAuthStrategy` |
| --- | --- | --- |
| `headers()` | `{}` | `{ authorization: "Bearer …" }`, or `{}` when there is no token |
| `credentials` | `include` | **`omit`** |
| Host | browser | Tauri webview, CLI, integration test |

`credentials: "omit"` stops a desktop shell handing third-party origins a session cookie.
**`TokenProvider` is abstract because token storage differs by host** (OS keychain via Tauri `invoke`,
mobile keychain, in-memory in tests), all async, so `get()` returns a promise. Two methods: `set(null)`
clears, and `noImplicitOverride` makes a stale `token()`/`store()`/`clear()` triple a compile error. Wire
details: [auth-strategy](reference/auth-strategy.md).

## Why the vanilla Better Auth client

`AuthClient` wraps `better-auth/client`, **never `better-auth/react`**, whose `useSession` keeps a second
cache that disagrees with TanStack Query on sign-out — a signed-in shell around `UNAUTHORIZED`s. The
vanilla client puts session state in the one cache, via `apps/web`'s `SessionStore` riding the SSR
payload. **It throws rather than returning `{ data, error }`**, so `SignInForm` handles errors like every
other mutation.

## Reference

- [The transport](reference/transport.md) — what crosses the wire, and what a backend swap touches.
- [`AuthStrategy`](reference/auth-strategy.md) — cookie versus bearer, and what the specs pin at the
  wire.
- [The Better Auth boundary](reference/better-auth.md) — why both clients throw, the sign-in that
  succeeds and is not one, and the code-then-status table the normalizer maps with.

## What a backend swap costs

| Scenario | Changes here | Changes anywhere else |
| --- | --- | --- |
| TanStack Start + oRPC (today) | — | — |
| NestJS + oRPC | `RPCLink` → `OpenAPILink` | none |
| NestJS + plain REST | add a REST transport under `client/` | none |
| Tauri desktop | `CookieAuthStrategy` → `BearerAuthStrategy` at one call site | none |
| CLI or script | constructs `ApiClient.overHttp` directly, skips `query` | none |

**With NestJS, SSR loses its in-process shortcut** — point the server client at an internal URL and
forward the request's cookies: one factory change, because loaders go through `ApiClient`, not the
router.

## Picking the transport is a build-time decision, not a runtime one

`apps/web/src/router.tsx` chooses with `createIsomorphicFn`; the Start plugin removes the inapplicable
branch and its imports, keeping `createServerRpcClient` and the container graph out of the client
bundle — proven by `check-architecture.mjs`'s bundle assertion.

> [!IMPORTANT]
> **`overHttp` refuses a relative base outside a browser.** `/api/rpc` cannot resolve under Node, so the
> first call would throw `TypeError: Invalid URL` deep in a loader; the guard throws an `InternalError` at
> construction whose `cause` names `ApiClient.inProcess` (on `cause`, since the code **is** the message —
> [`errors`](../../errors/docs/index.md)).

**Two namespace accessors (`role`, `member`); the rest go through `raw`.** A slice adds
`public get task() { return this.rpc.task; }`, keeping the surface readable and giving per-namespace
concerns (a retry policy) a home.
