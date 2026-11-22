---
title: The two import surfaces
description: Why this app has two import.ts files rather than one, what each may name, and the three imports that are deliberately outside both because a tool demands it.
---

# The two import surfaces

Every package writes each external import once, in `src/import.ts`. This app has **two**, splitting on
the server-only boundary:

| Surface | May name | Read by |
|---|---|---|
| `src/import.ts` | the client-safe workspace packages, React, `@tanstack/react-query`, `createRouter`, zod | anything |
| `src/server/import.ts` | `@loadbearing/composition`, `@loadbearing/application` and the vendor SDKs beneath them | `src/server/**` only |

`apps/web/src/**` may not name `composition`, `application`, `auth`, `infrastructure` or their vendors;
`apps/web/src/server/**` is exempt, since nothing reading it reaches a browser. **One surface would give
every route an edge into the server graph**, leaving bundle cleanliness to tree-shaking (what
`check-architecture` §8 avoids depending on). `server/import.ts` lists what the transport touches; a
server-only package on the client surface is the leak.

## The three imports that sit outside both

Each tool-forced and commented at its line:

- **`env.ts` keeps its own imports** — its server-only marker (which fails the build if the module joins
  the client graph) is a side-effect import that cannot be re-exported. Before it, `Env` shipped to the
  browser as `Schema.parse({})` and threw on `DATABASE_URL` before first render.
- **`@tanstack/react-router` is direct in `src/route/`** — the generator recognises `createFileRoute`
  only from that literal specifier and otherwise prepends its own. `createRouter` stays on the surface
  since the generator never reads `router.tsx`.
- **`@tanstack/react-start` and `/server` are direct in `server/*.fn.ts`** — a re-exported `/server`
  entry is a client-graph edge import protection denies ([server functions](./server-functions.md)).

## The stylesheet

On neither surface: `__root.tsx` links [`src/style/app.css`](../../src/style/app.css) via `?url`. It is
the Tailwind entry — `@import`s `@loadbearing/ui/style.css`, names scanned sources with `@source`, and
compiles one stylesheet.

## What the client surface deliberately does not carry

- **`SERVER_CATALOG`** — always the client catalog via `StaticContentSource`; `email` is the worker's
  and the ESLint ban fires on that line.
- **Wire shapes** — only the two branded ids `session.fn.ts` casts to; rendered data comes via `query`.
- **zod beyond search parameters** — routes validate their own URL; wire shapes are `contracts`'.
- **A module-singleton `AuthClient`** — built per component, since instances differ per environment
  and the desktop shell supplies its own absolute URLs.
