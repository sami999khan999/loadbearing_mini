---
title: The supervisor
description: Lanes, WORKER_QUEUES, the two ceilings a worker process checks before it starts consuming, and the queue CLI that pauses a queue everywhere.
---

# The supervisor

**A worker process runs lanes, and `WORKER_QUEUES` picks which.** A lane is one queue served
inside one process: one BullMQ `Worker` with its own concurrency. Before this, every process ran
every consumer. Adding a copy to speed up embedding also added a copy of mail, outbox and the rest,
and each copy opened database connections.

| Piece | File | Job |
|---|---|---|
| `LaneRegistry` | `src/supervisor/lane-registry.ts` | Every queue this build can serve, in start order, with its starting concurrency and the variable that sets it |
| `QueueLimits` | `src/supervisor/queue-limits.ts` | The most one process may run of each queue, whatever the environment says |
| `WorkerSupervisor` | `src/supervisor/worker-supervisor.ts` | Checks the ceilings, starts the selected lanes, and closes them on drain |

## `WORKER_QUEUES`

A comma list of queue names. Unset or empty serves every queue, which is the behaviour before the
variable existed.

```bash
# One service for the light queues, one for embedding with three replicas.
WORKER_QUEUES=mail,event,notification,maintenance
WORKER_QUEUES=embedding
```

Copies of one service split a queue's jobs between them: BullMQ hands each job to one taker, and
the repeatable schedules already dedupe by job id.

**A wrong name is a boot error, not a warning.** A typo here is a queue nobody drains, and it
looks exactly like a quiet queue.

**Leaving `mail` out is allowed, and it is your job to serve it elsewhere.** Every sign-up's
verification link is a mail job. The same goes for `event`: without it the outbox is never drained.

Every process still registers the schedules and runs the partition check at boot, whatever lanes it
serves. Registration is idempotent, and a schedule only puts jobs on a queue — the lane that
serves the queue runs them.

## Two ceilings, checked before the first lane starts

1. **Per queue:** a lane's concurrency may not exceed `QueueLimits`. Maintenance is at most 4,
   because its jobs take table-level locks.
2. **Per process:** the sum across the selected lanes may not exceed
   `WORKER_PROCESS_MAX_CONCURRENCY` (64). The error names each lane's variable and value.

Both are refusals, and both happen before any lane starts. A refusal halfway would leave a process
consuming some queues and then exiting.

The older `worker.pool.oversubscribed` warning still runs after boot. It compares the lanes that
started, mail excluded, against `DATABASE_POOL_MAX` — see [`env.md`](./env.md). The ceiling is a
hard stop on a process that is clearly misconfigured; the warning is about the pool you actually
have.

## Pausing a queue everywhere

```bash
pnpm queue:status              # waiting, active, delayed and failed per queue, and paused or not
pnpm queue:pause mail          # every worker stops taking mail jobs; running ones finish
pnpm queue:resume mail
pnpm queue:pause all           # every queue, e.g. before moving the queue Redis
```

The pause is BullMQ's own, stored in the queue's Redis keys. Every worker obeys it, including one
started after it, and it survives restarts. Publishers keep enqueueing, so nothing is lost; the jobs
wait. `queue:pause` with no queue is refused rather than read as `all`.

## What comes next

The big kit adds the runtime half on this same lane list: a process registry, pause and queue moves
per process, and in-process autoscaling, all from a platform **Workers** page. It is additive here.
See [Worker control](../../../../docs/scale/worker-control.md).
