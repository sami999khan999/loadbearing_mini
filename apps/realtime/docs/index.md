---
title: "@loadbearing/realtime"
description: The stream process. It holds every open browser stream and nothing else, so a thousand open tabs or a reconnect wave after a deploy never slows the web app's pages.
---

# `@loadbearing/realtime`

**This app holds the open line to every browser tab** — so the web app does not.
Every tab keeps one server-sent-event stream open for as long as it is open; held in the
page-rendering process, a busy hour or a deploy's reconnect wave would compete with every click.

It holds no business logic, and no router of its own. The one stream — `realtime.stream`, the
user's channel — comes from `@loadbearing/api-server`, the same
`authed` chain the web app mounts. Its own: the HTTP listener, the probe and the shutdown.

```
apps/realtime/src/
├── main.ts                       Env → Container → StreamListener → RealtimeBootstrap
├── env.ts                        the process's one `process.env` reader
├── import.ts
├── server/
│   └── stream-listener.ts        node:http, `/api/realtime/*` → the oRPC handler, `/healthz`
└── bootstrap/
    └── realtime-bootstrap.ts     start, and a stop that hands every stream on
```

## How a frame reaches a tab

The worker and the web app publish to Redis — a notification, a membership change. This
process subscribes, once per channel with a reader, and writes each frame down the streams on it.
Nothing here writes to Postgres, and the only reads are the principal, once per stream opened, and
the membership check each stream repeats every minute. Its pool is five connections for that reason.

## How the browser reaches it

At the web origin under `/api/realtime`: `ApiClient.overHttp` routes `realtime.*` there, everything else
to `/api/rpc`; Vite (dev) or the reverse proxy (prod) forwards to `REALTIME_PORT`. Same origin lets the
host-scoped `SameSite=Lax` cookie ride with no CORS.

## Reference

- [Env](reference/env.md) — what it needs, and the one setting that must match the web app's.
- [Shutdown](reference/shutdown.md) — why a stop ends streams cleanly and spread out.
