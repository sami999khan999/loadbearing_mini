---
title: "@loadbearing/worker"
description: The background process. Six consumers, seven schedules, one container — and a single recurring failure it is shaped to prevent: work that stops quietly and looks exactly like work that is running.
---

# `@loadbearing/worker`

**What runs when nobody is watching.** No business logic: each consumer deserialises a job, builds a
`SystemPrincipal` and calls a use-case, as an oRPC router does. One failure shapes it:

> A schedule with no consumer accumulates silently. A consumer with no store succeeds silently.
> Both look identical, from the outside, to a pipeline that is working.

| | |
| --- | --- |
| **Package** | `@loadbearing/worker` (private, never published) |
| **Entrypoint** | `src/main.ts` — nothing imports this app |
| **Loose at `src/`** | `main.ts` and `env.ts` only, both resolved by name — see [Folders](../../../docs/opinions/folders.md) |
| **Depends on** | `@loadbearing/{application,composition,content,contracts,infrastructure,permissions}`, plus `bullmq` |
| **Environment** | node only. The one process that reads `SERVER_CATALOG` |

```
apps/worker/
├── vitest.config.ts
├── src/
│   ├── main.ts                       ← the entrypoint; signals, boot, exit
│   ├── env.ts                        → Env      (the second of two process.env readers)
│   ├── import.ts                     ← the one outside surface
│   ├── bootstrap/
│   │   ├── index.ts
│   │   ├── worker-bootstrap.ts       → WorkerBootstrap
│   │   ├── system-principal.ts       → SystemPrincipal
│   │   └── with-shard.ts             → withShard
│   ├── consumer/
│   │   ├── index.ts
│   │   ├── assistant.consumer.ts     → AssistantConsumer   (one answer per job)
│   │   ├── embedding.consumer.ts     → EmbeddingConsumer   (index · reembed · doc-reindex)
│   │   ├── mail.consumer.ts          → MailConsumer        (send)
│   │   ├── notification.consumer.ts  → NotificationConsumer (digest-fanout · digest)
│   │   ├── outbox.consumer.ts        → OutboxConsumer      (drain · deliver)
│   │   └── maintenance.consumer.ts   → MaintenanceConsumer (cleanup · partitions · retention · orphans ·
│   │                                   spares · doc-* · tenant-*)
│   ├── supervisor/
│   │   ├── index.ts
│   │   ├── lane-registry.ts          → LaneRegistry
│   │   └── worker-supervisor.ts      → WorkerSupervisor
│   ├── schedule/
│   │   ├── index.ts
│   │   ├── cleanup.schedule.ts       03:00 daily
│   │   ├── digest.schedule.ts        07:00 daily
│   │   ├── orphans.schedule.ts       04:00 daily
│   │   ├── outbox-drain.schedule.ts  every second
│   │   ├── partitions.schedule.ts    02:00 on the first, and once at boot
│   │   ├── retention.schedule.ts     03:30 daily
│   │   ├── spares.schedule.ts        every five minutes
│   │   └── utc-cron.ts               → UtcCron
└── tests/                            ← mirrors src/: bootstrap/, consumer/, supervisor/
```

---

## What belongs here

Consumers, schedules and the wiring that starts them — never a rule, query or decision (logic identical
over HTTP is a use-case). `EmbeddingConsumer` is the shape: deserialise, build a principal, call
`IndexDocumentUseCase`, let it throw. Adapters come from the container.

## `SystemPrincipal`: narrow, explicit, reviewed

**Every job carries an organization** — no global data, so no global principal. The grant list is
written out and reviewed (never `PermissionRegistry.instance.all()`), validated at boot, not at 3am after
a rename. The actor id is a reserved uuid — a tenant id in an actor column reads as a user.

## Reference

- [The consumers](reference/consumers.md) — why maintenance is serial, why `handle()` is public, and
  why `EmbeddingConsumer` catches nothing.
- [The supervisor](reference/supervisor.md) — lanes, `WORKER_QUEUES`, the two ceilings a process
  checks before it starts consuming, and `pnpm ops queue-pause`.
- [The schedules](reference/schedules.md) — the fixed job ids that make registration idempotent, the
  clock order, and why only the digest retries.
- [Subscribers](reference/subscribers.md) — the contract every outbox subscriber keeps, and why
  they live in `application` rather than beside the consumer that calls them.
- [Shutdown](reference/shutdown.md) — what `stop()` drains, the race that bounds it, and the order
  everything closes in.
- [`Env`](reference/env.md) — why the schema is smaller than the web app's and deliberately not
  shared with it.
