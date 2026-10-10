---
title: AI assistant plan — the lite port of the big kit's assistant, simpler but scalable without an architecture change
updated: 2026-10-10
owner: sami
schema: plan/v1
source: owner request 2026-10-10 — build in the big kit first, then port a simpler version here; the big kit's `plans/AI-CHAT-PLAN.md` is the full plan, checked against its open backlog the same day
---

# AI assistant (lite)

The full plan is the big kit's `plans/AI-CHAT-PLAN.md`. It covers sizing for 100K concurrent users,
the request flow, every step, and the security rules. This file is what lite takes of it.
[`WORKER-SCALING-PLAN.md`](WORKER-SCALING-PLAN.md) comes first: the assistant runs on a worker
service with `WORKER_QUEUES=assistant`.

**This is ported from the big kit after its `AI.1` closes.** Lite keeps the same design: queue,
then worker, then Redis, then realtime. Streaming straight from the web request is the one
shortcut that would need an architecture change later.

**It is called the Assistant.** The big kit's Messaging module owns the word "chat". Lite has no
Messaging, but it uses the same names (`assistant_*` tables, `assistant.*` procedures,
`ai.assistant.use`, `ASSISTANT_*` env), so the two kits stay identical.

## What lite builds

- **Shared with the big kit:**
  - the same port, adapters (`none`, `fake`, OpenAI, OpenRouter, Gemini) and env names;
  - the same tables (partitioned and routed), use cases, contracts, permissions, rate limits and
    budget;
  - the same streaming and UI.
- **Docs semantic search** (the big kit's `DC.2`) is ported with it. Lite's Docs search is
  full text only, and the assistant reads Docs only through `SearchDocsUseCase`, so space
  visibility stays in one place.
- **No activity row per message.** Only `ai.assistant.thread.created|deleted` are recorded, and
  metering is the `ai_usage` row.
- **The same stream-log rules:**
  - one log per answer;
  - a resume reads only after `lastEventId` (`XRANGE key (lastId +`), never the whole stream;
  - a 10-minute TTL.

Lite already has the search modes, so `AI.0` isn't needed.

## What lite leaves out

- **Separate Redis.** There's one Redis. `REDIS_ASSISTANT_URL` is kept as a name and falls back to
  that single instance.
- **The worker dashboard.** The `assistant` lane comes from `WORKER_QUEUES` with a static
  concurrency, and `pnpm queue:pause assistant` replaces the pause button. There's no autoscaling.
- **Platform-wide usage reporting.** There's no ClickHouse projection and no platform-wide usage
  panel. Org admins still see their own org's usage.
- **Retention.** `retentionMonths` is set but not acted on, since lite drops no partitions.
- **The load-test script.** It's copied with the scale docs when needed.

## Scaling later

Scaling later is `docs/scale/` copy-backs plus config:
1. Split Redis, then point `REDIS_ASSISTANT_URL` at its own instance.
2. Copy back the worker dashboard from the big kit.
3. Add the replica.
4. Add ClickHouse usage reporting.
5. Add shard nodes.
