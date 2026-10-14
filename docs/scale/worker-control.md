---
title: Worker control
description: Bringing back the big kit's Workers page — live processes, pausing, moving queues between processes and in-process autoscaling — on top of the lane supervisor lite already runs.
---

# Worker control

**The limit.** Lite chooses each worker's queues with `WORKER_QUEUES` and fixes their concurrency at
boot. Changing either is a redeploy. Pausing a queue is `pnpm queue:pause <queue>` from a shell with
the queue Redis URL. Nobody can see which processes are running or what each one serves.

**When.** More than one worker service runs, or an operator without shell access needs to pause a
queue during an incident, or a queue's load swings enough that a fixed concurrency is wrong for
part of the day.

**The fix: copy files back.** The big kit's platform **Workers** page lists every live worker process
and lets a platform admin:

- pause a queue everywhere, one process, or one queue on one process;
- move queues between running processes, within a second;
- autoscale a queue's concurrency inside each process between a minimum and a maximum.

It never starts or stops processes; that stays the host's job.

## Why this one is additive

Lite already runs the big kit's static half, under the same names:

| Already in lite | Where |
|---|---|
| `WORKER_QUEUES` and `WORKER_PROCESS_MAX_CONCURRENCY` | `apps/worker/src/env.ts` |
| `LaneRegistry` and `WorkerSupervisor` | `apps/worker/src/supervisor/` |
| `QueueLimits` | `packages/application/src/primitive/queue-limits.ts` |
| `QueueControlGateway` and `BullMqQueueControlGateway` | `packages/application/src/platform/queue-control.gateway.ts`, `packages/infrastructure/src/bullmq/bullmq-queue-control.gateway.ts` |

So the copy adds a reconcile loop to the supervisor and a page on top. Nothing here is replaced
except `worker-supervisor.ts`, `lane-registry.ts` and the bootstrap that constructs them.

> [!IMPORTANT]
> **This is newer than the cut.** The big kit built worker control after lite was cut, so port from
> its commits `fe5217f1` to `329b1963` (2026-10-10), not from the cut commit. `upstream:` paths on
> this page are at `329b1963`.

## What to copy

```
upstream:packages/application/src/platform/worker-fleet.gateway.ts
upstream:packages/application/src/platform/worker-queue-settings.repository.ts
upstream:packages/application/src/platform/worker-autoscale.rules.ts
upstream:packages/application/src/platform/worker-control.rules.ts
upstream:packages/application/src/platform/get-worker-fleet.use-case.ts
upstream:packages/application/src/platform/pause-worker-queue.use-case.ts
upstream:packages/application/src/platform/pause-worker-process.use-case.ts
upstream:packages/application/src/platform/save-queue-autoscale.use-case.ts
upstream:packages/application/src/platform/set-worker-process-queues.use-case.ts
upstream:packages/application/src/platform/reset-worker-process.use-case.ts
upstream:packages/infrastructure/src/redis/redis-worker-fleet.gateway.ts
upstream:packages/infrastructure/src/pg/repository/pg-worker-queue-settings.repository.ts
upstream:packages/composition/src/fake/in-memory-worker-fleet.gateway.ts
upstream:packages/composition/src/fake/in-memory-queue-control.gateway.ts
upstream:packages/composition/src/fake/in-memory-worker-queue-settings.repository.ts
upstream:apps/worker/src/supervisor/
upstream:apps/worker/src/bootstrap/worker-bootstrap.ts
upstream:packages/feature/src/platform/worker-queue.list.tsx
upstream:packages/feature/src/platform/worker-process.list.tsx
upstream:packages/feature/src/platform/queue-autoscale.form.tsx
upstream:packages/feature/src/platform/worker-queues.form.tsx
upstream:apps/web/src/route/(app)/_authenticated/platform/workers.tsx
upstream:apps/worker/docs/reference/supervisor.md
```

Then merge these by hand; each is a few lines in a file lite already has:

- **Table:** `worker_queue_settings` from `upstream:packages/infrastructure/src/pg/schema/platform.schema.ts`.
  Run `pnpm db:generate` for the migration rather than copying the big kit's numbered one, and add
  the table to `CATALOG` in `packages/application/src/primitive/shard.ts`.
- **Permissions:** `platform.worker.read` and `platform.worker.manage` in
  `packages/permissions/src/catalog/platform.permissions.ts`, and `workers` in
  `packages/permissions/src/route/platform.routes.ts`. `pnpm db:seed` grants them to the platform
  admin role.
- **Contract and router:** the worker fleet schemas in `platform.contract.ts`, the six procedures in
  `platform.procedures.ts`, their keys in `packages/contracts/src/catalog/platform.permissions.ts`,
  the seven `platform.queue.*` and `platform.worker.*` actions in `platform.actions.ts`, and the
  handlers in `apps/web/src/server/orpc/platform.router.ts`.
- **Container:** `workerFleet`, `queueControl`, `workerQueueSettings` and the six use cases under
  `platformAdmin`.
- **Log events:** the six `worker.*` codes in `packages/observability/src/catalog/core.events.ts` and
  their shapes in `event-shape.ts`.
- **Client:** `workerFleet` in `platform.queries.ts`, the five mutations in
  `platform.mutations.ts`, `QueryKeys.platform.workers`, the nav entry in `platform-nav.tsx`, and
  the `platform.workers.*` copy in English and Bengali.

**Lite's one Redis is fine.** The registry, overrides and control channel live on the queue Redis,
which in lite is the only one and already runs `noeviction`. After a [Split Redis](split-redis.md)
they move with `REDIS_QUEUE_URL`.

**Keep `pnpm queue:pause`.** It writes the same BullMQ pause the page does, and it still works when
the web app is down. The page reads that state back, so the two never disagree.

## Check it worked

1. Run two workers with different `WORKER_QUEUES`. The Workers page lists both, with their queues.
2. Pause `mail` on the page, request a password reset, and see it wait in the queue table and not
   reach Mailpit. Resume, and it arrives.
3. Move a queue from one process to the other. Within a second the page shows the new owner.
4. Kill one worker with `kill -9`. It drops off after about 15 seconds, and any queue only it served
   shows as unserved.
