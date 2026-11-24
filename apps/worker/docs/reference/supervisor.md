---
title: The supervisor
description: Lanes, WORKER_QUEUES, the two ceilings a worker process checks before it starts consuming, and the queue CLI that pauses a queue everywhere.
---

# The supervisor

**A process runs lanes; `WORKER_QUEUES` picks which.** A lane is one queue in one process — a BullMQ
`Worker` with its own concurrency — so scaling embedding no longer copies mail, outbox and their
connections.

| Piece | File | Job |
|---|---|---|
| `LaneRegistry` | `src/supervisor/lane-registry.ts` | Every queue this build can serve, in start order, with its starting concurrency and the variable that sets it |
| `QueueLimits` | `packages/application/src/primitive/queue-limits.ts` | The most one process may run of each queue, whatever the environment says |
| `WorkerSupervisor` | `src/supervisor/worker-supervisor.ts` | Checks the ceilings, starts the selected lanes, and closes them on drain |

## `WORKER_QUEUES`

A comma list of queues; unset or empty serves all.

```bash
# One service for the light queues, one for embedding with three replicas.
WORKER_QUEUES=mail,event,notification,maintenance
WORKER_QUEUES=embedding
```

Copies split a queue's jobs (one taker per job; schedules dedupe by id). **A wrong name fails boot** — a
typo is an undrained queue that looks quiet.

**Omitting `mail` or `event` is allowed — serve them elsewhere** (every sign-up mails; `event` drains the
outbox). Every process still registers schedules and runs the boot partition check (idempotent; lanes run
the jobs).

## Two ceilings, checked before the first lane starts

1. **Per queue:** a lane's concurrency may not exceed `QueueLimits`. Maintenance is at most 4,
   because its jobs take table-level locks.
2. **Per process:** the sum across the selected lanes may not exceed
   `WORKER_PROCESS_MAX_CONCURRENCY` (64). The error names each lane's variable and value.

Both refuse before any lane starts (halfway would consume some queues, then exit). After boot,
`worker.pool.oversubscribed` warns about the real pool ([env](./env.md)).

## Pausing a queue everywhere

```bash
pnpm ops queue-status              # waiting, active, delayed and failed per queue, and paused or not
pnpm ops queue-pause mail          # every worker stops taking mail jobs; running ones finish
pnpm ops queue-resume mail
pnpm ops queue-pause all           # every queue, e.g. before moving the queue Redis
```

BullMQ's own pause, in the queue's Redis keys: every worker obeys it, later ones too, across restarts;
publishers keep enqueueing. A bare `ops queue-pause` is refused, not read as `all`. The big kit adds a
process registry, per-process pause and moves, and autoscaling from a platform **Workers** page
([Worker control](../../../../docs/scale/worker-control.md)).
