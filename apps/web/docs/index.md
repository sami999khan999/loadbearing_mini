---
title: "@loadbearing/web"
description: The TanStack Start application. Thin, deletable and framework-shaped — every decision it makes is about the seam between a browser and the server graph, and no business logic lives here.
---

# `@loadbearing/web`

**This app answers one question: how does a browser reach the domain?** Routing, SSR, the oRPC
transport, four server functions and a session snapshot. It renders from `packages/feature` and decides
via `packages/composition`, so a second shell (Tauri, mobile) replaces this package and nothing beneath.

| | |
| --- | --- |
| **Package** | `@loadbearing/web` (private, never published) |
| **Entrypoint** | none — `vite build` produces `.output/`, and nothing imports this app |
| **Depends on** | `@loadbearing/{api-client,content,contracts,feature,permissions,query,ui}` client-side; `@loadbearing/composition` server-side only |
| **Environment** | both halves, separated by the server-only boundary |

```
apps/web/
├── vite.config.ts
├── vitest.config.ts
├── src/
│   ├── env.ts                        → Env               (server-only; one of two process.env readers)
│   ├── endpoint.ts                   → Endpoint          (the two addresses a browser needs)
│   ├── import.ts                     ← the client-safe outside surface
│   ├── router.tsx                    → createAppRouter
│   ├── start.ts                      → the request middleware: security headers
│   ├── route-tree.gen.ts             ← generated; never edited
│   ├── route/
│   │   ├── __root.tsx
│   │   ├── -context.ts               ← `-` prefix: not a route
│   │   ├── -guard.ts                 → RouteGuard
│   │   ├── -messages.ts
│   │   ├── -redirect.ts
│   │   ├── -session.ts               → refreshSession, completeSignIn
│   │   ├── (shell)/                  ← anonymous: sign-in, sign-up, recovery, invitation
│   │   ├── (app)/_authenticated/     ← settings, organization
│   │   ├── (dev)/kitchen-sink.tsx
│   │   └── api/{health,auth/$,rpc/$}.ts
│   ├── server/
│   │   ├── import.ts                 ← the server-only outside surface
│   │   ├── container.ts
│   │   ├── cors.ts
│   │   ├── security-headers.ts       → SecurityHeaders
│   │   ├── rpc-client.ts
│   │   ├── {session,appearance,invitation,doc}.fn.ts
│   │   └── orpc/                     → base, routers, the error interceptor
│   └── store/
│       ├── session.store.ts          → SessionStore, SessionSnapshot
│       └── appearance.store.ts       → AppearanceStore
└── tests/
    ├── endpoint.spec.ts
    ├── env.spec.ts
    ├── route/redirect.spec.ts
    ├── server/{cors,error.interceptor,security-headers}.spec.ts
    └── store/{appearance,session}.store.spec.ts
```

---

## What belongs here

Only: **a route, layout or guard**; **a transport concern** (oRPC chain, CORS, server functions, the
error interceptor); and **per-request state riding the SSR payload** (session snapshot, message store,
appearance). A rule stateable without HTTP, a query, a component or a permission decision — anything a
desktop shell would repeat — belongs in `feature`, `query` or `application`. Mechanically:
`grep -rn "@loadbearing/composition" src/` hits only `src/server/`, and nothing in `src/route/` names a
use-case.

---

## The two import surfaces

Two `import.ts` files, split on the server-only boundary:

| Surface | May name | Read by |
|---|---|---|
| `src/import.ts` | the client-safe packages, React, the router, zod | everything |
| `src/server/import.ts` | `@loadbearing/composition` and what is under it | `src/server/**` only |

A server-only package on the client surface is the leak, visible at one line. Three tooling-forced
imports sit outside both ([import-surfaces](reference/import-surfaces.md)).

## Four enforcement surfaces, in order of authority

Removing a permission must hide the affordance **and** return `FORBIDDEN` — otherwise it is security
theatre or a UI of failing buttons.

1. `Authorizer.assert()` inside the use-case — **the gate**.
2. `principalMiddleware` on the oRPC chain — defence in depth, failing closed.
3. `RouteGuard` in a route's `beforeLoad`.
4. `<Can>` in a component — a UX affordance, never a check.

See [`reference/enforcement-surfaces.md`](reference/enforcement-surfaces.md).

## Four routes unwind the session the same way, and one deliberately does not

Sign-out, organization switch, create and invitation accept end with the same four steps — clear the
cache, invalidate the session store, re-run the root loader, navigate — as `refreshSession` in
`route/-session.ts`. Out of order, one frame renders the old tenant's rows under the new session.
**Sign-in gets `completeSignIn`**: nothing cached belongs to a previous session, and clearing would
discard the messages just loaded for the destination.

## Reference

- [The two import surfaces](reference/import-surfaces.md) — why the split exists, and the three
  imports that sit outside both.
- [Server functions](reference/server-functions.md) — why a `*.fn.ts` is half client, and what that
  means for what it may import.
- [Enforcement surfaces](reference/enforcement-surfaces.md) — the four checks, their order of
  authority, and why the weakest one is still worth having.
- [`Env` and `Endpoint`](reference/env.md) — the one cross-field rule, why `Endpoint` exists as a
  separate file, and the `.invalid` base URL.
