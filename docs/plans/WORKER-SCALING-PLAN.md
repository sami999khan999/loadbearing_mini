---
title: Worker scaling plan — choose a worker's queues by config, with the large kit's control dashboard one copy-back away
updated: 2026-10-10
owner: sami
schema: plan/v1
source: owner request 2026-10-10; the large kit's `plans/WORKER-CONTROL-PLAN.md`, which this is the lite share of
---

# Worker scaling (lite)

## Context

Every worker process runs all five consumers today: embedding, mail, outbox, notification and
maintenance.
- Concurrency is fixed by `WORKER_*_CONCURRENCY` at boot (`apps/worker/src/bootstrap/worker-bootstrap.ts`).
- Adding a worker copy to speed up one queue adds a copy of every queue, and every copy opens
  database connections.

The large kit gets the full worker control plane in `plans/WORKER-CONTROL-PLAN.md`:
- a platform `Workers` page;
- pause per queue, per process and per lane;
- queue reassignment at runtime;
- in-process concurrency autoscaling.

The owner asked for lite to stay simple, but laid out so it can scale the same way without an
architecture change. So lite builds the **static** half now, under the **same names**. The dynamic
half is then an additive copy-back.

## Build now

1. **`WORKER_QUEUES`:** a comma list of queue names, defaulting to all of them.
   - An unknown name fails at boot with the list of valid names.
   - Any host can then run specialised worker services and replicas. For example, one `worker`
     service on `mail,outbox,notification,maintenance` and a `worker-embedding` service with
     three replicas.
   - Copies of one service split a queue's jobs between them. BullMQ hands each job to one taker,
     and repeatable schedules already dedupe.
2. **Supervisor structure, with static lanes:**
   - `apps/worker/src/supervisor/` holds `WorkerSupervisor` and a `LaneRegistry` that maps each
     `QueueName` to a lane factory: the existing consumer handler plus its options.
   - `WorkerBootstrap.start()` starts the lanes `WORKER_QUEUES` names, and `drain()` closes them.
   - There is no control loop, registry or autoscaler. Those are the large kit's additions, and they
     slot into this structure.
3. **Ceilings, checked at boot:**
   - `QueueLimits` in code holds the per-queue maximum; maintenance stays serial.
   - `WORKER_PROCESS_MAX_CONCURRENCY` (default 64) caps the sum across the process's lanes. It
     replaces `warnIfOversubscribed()` with a refusal to boot, naming the variables to lower.
4. **Queue CLI**, beside `packages/infrastructure/queue-replay.ts`:
   - `pnpm queue:status`: waiting, active, delayed and failed counts per queue, from
     `getJobCounts`.
   - `pnpm queue:pause <queue|all>` and `pnpm queue:resume <queue|all>` use BullMQ's global pause,
     which every worker obeys and which survives restarts.
   - These cover the large kit's "pause a whole queue" until the dashboard is copied back.
5. **Env and docs:**
   - `.env.example`, `apps/worker/src/env.ts` and `apps/worker/docs/reference/env.md` get the two
     new variables. The existing concurrency variables are described as each lane's concurrency
     per process.
   - `docs/infra/deployment.md` gets a section on running specialised worker services.
   - `docs/scale/worker-control.md` covers the copy-back below.
6. **[`AI-CHAT-PLAN.md`](AI-CHAT-PLAN.md)** (the AI Assistant) uses `WORKER_QUEUES` from this plan instead of
   defining it.

## Kept identical to large, so the copy-back is additive

- **Names:**
  - `WorkerSupervisor`, `LaneRegistry` and `QueueLimits`;
  - the env names;
  - the ports `WorkerFleet` and `QueueControl`;
  - the table `worker_queue_settings`;
  - the permissions `platform.worker.read|manage`;
  - the route `platform/workers`.
- **`docs/scale/worker-control.md`** lists what to copy from large's commit range once it is built:
  - the Redis registry and control channel;
  - the reconcile loop and autoscaler;
  - the settings table and its migration;
  - the use cases, contract, router and page.
  
  In lite the queue Redis and cache Redis are one instance with `noeviction`, so the registry keys
  need no extra Redis.

## Verification

- Unit tests:
  - `WORKER_QUEUES` parsing (default, a subset, an unknown name);
  - `LaneRegistry` starts only the named lanes;
  - the boot ceiling refuses an oversubscribed process.
- Two workers against the dev stack, one with `WORKER_QUEUES=mail` and one with the rest:
  - an invite email is sent only by the first worker;
  - a doc index job is handled only by the second.
- `pnpm queue:pause mail`: an invite waits in the queue and doesn't reach Mailpit. After
  `queue:resume mail` it arrives. `queue:status` shows the waiting count both times.
- `pnpm build:packages && pnpm typecheck && pnpm lint && pnpm test`, `check:architecture`,
  `check:contrast`, and the worker boot smoke with `WORKER_QUEUES=mail`.
