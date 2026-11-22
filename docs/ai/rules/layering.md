---
title: Layering
description: The one-way dependency graph, the server-only boundary, and where a concrete adapter may be named.
---

# Layering

Dependencies point one way: a package imports from its left, never its right.

```
errors → core → permissions · observability → contracts → asset · content
                                                             ↓
                                     application → infrastructure → auth → composition → api-server
                                                                                               ↓
                                     ui → api-client → query → feature → apps/{web,worker}
```

- **`packages/application` is the domain: no framework, no logging.** No `@orpc/*`, `@tanstack/*`,
  `@nestjs/*`, `drizzle-orm`, `ioredis`, `bullmq`, `@aws-sdk/*`, `better-auth`, `pg`, `express`,
  `fastify`, `hono`, and no `@loadbearing/observability`. Both are CI assertions.
- **`packages/infrastructure` is organised by vendor**, not capability: `pg/`, `redis/`, `s3/`,
  `bullmq/`, `openai/`, `clickhouse/`, `loki/`, `smtp/`. A vendor swap is `rm -r src/<vendor>/`.
- **`packages/composition` is the DI root** — the only place a concrete adapter is named.
- **`packages/api-server` is the router half of the transport** (the `authed` chain, routers more
  than one app mounts). It may name `@orpc/server`; HTTP adapters stay in the apps.
- **`asset` and `content` sit left of `application`**, because `composition` imports `content` for
  the mailers. Both are isomorphic and reach the client bundle, so both carry the server-only ban.
- **`apps/*` are thin, deletable, framework-shaped.** No business logic.

### Server-only boundary

A Biome error inside `packages/{ui,feature,query,errors,content,asset}` and `apps/*/src`:
`@loadbearing/{infrastructure,auth,composition,application,api-server}`, `drizzle-orm`, `pg`,
`ioredis`, `bullmq`, `better-auth`. Cross via `@loadbearing/contracts`. The ban lifts in
`apps/web/src/server/**` and any `*.server.ts` — those paths are the seam.

`"use client"` appears **only** in `ui`, `query`, `feature`; on an isomorphic package it breaks SSR
of translated copy and authorization.

Argument: [`docs/opinions/folders.md`](../../opinions/folders.md),
[`docs/opinions/dependencies.md`](../../opinions/dependencies.md).
