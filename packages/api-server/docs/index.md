---
title: "@loadbearing/api-server"
description: The router half of the transport — the authed middleware chain, the error interceptor and the stream router — shared by every app that serves procedures.
---

# `@loadbearing/api-server`

**`api-client` is how the browser reaches the server. `api-server` is what answers it**, minus the
HTTP adapter. The adapter is each app's own; everything behind it is here, because more than one
app mounts it: `apps/web` serves every procedure, and the stream process serves the stream.

| | |
| --- | --- |
| **Package** | `@loadbearing/api-server` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `application`, `composition`, `contracts`, `errors`, `observability`, `@orpc/server` |
| **Used by** | `apps/web`, through `apps/web/src/server/import.ts` |
| **Environment** | Node only. Server-only in Biome's import ban, like `composition` |

```
packages/api-server/src/
├── index.ts
├── import.ts
└── router/
    ├── base.ts                  the `authed` chain: correlation → errors → principal → shard
    ├── error.interceptor.ts     every failure to the wire envelope, logged once
    ├── rate-limit.policy.ts     the procedures that are limited, and how hard
    ├── stream-revalidation.ts   an open stream asks again every minute
    └── realtime.router.ts       the stream: the user's channel
```

**A package, not an `apps/web` folder:** apps cannot import each other, and the stream process needs the
identical chain — principal resolution, the fail-closed gate, the shard scope across every frame. A copy
would be the subtlest transport code twice ([dependencies](../../../docs/opinions/dependencies.md), Tier 3).
**The apps keep** `RPCHandler` (`@orpc/server/fetch` or `/node`), CORS and the mounting route — what changes
with the HTTP framework.

- [Router](reference/router.md) — the chain's order, why streams are wrapped twice, and why one
  namespace is one process.
