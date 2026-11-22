---
title: The worker
description: The background process: queues, email, notifications, indexing and scheduled housekeeping.
---

# The worker

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The background process. It runs every job off a Redis queue (BullMQ): sending email, delivering notifications, indexing documents, draining the outbox every second, and the scheduled housekeeping (nightly cleanup, monthly partitions, the daily digest and the rest). Nothing reaches Mailpit or a real inbox unless the worker is running.

| | |
|---|---|
| Folder | `apps/worker/` |
| Files | 39 |
| Uses | [Application (the business logic)](application.md), [Composition (the wiring)](composition.md), [Contracts](contracts.md), [Infrastructure (the real adapters)](infrastructure.md), [Permissions](permissions.md) |
| Used by | nothing; it is a top-level program |

## Every file

### `apps/worker/`

| File | What it does |
|---|---|
| `package.json` | Package manifest. |
| `tsconfig.json` | TypeScript settings. |
| `tsconfig.test.json` | TypeScript settings for type-checking the worker's tests. |
| `vitest.config.ts` | Test runner settings for the worker, with a complete fake environment so `Env` can load. |

### `apps/worker/src/`

| File | What it does |
|---|---|
| `env.ts` | `Env`: reads and validates every environment variable the worker needs, once, at start-up. The second of the two files allowed to read `process.env`. |
| `import.ts` | Every outside import the worker uses, written once. |
| `main.ts` | The worker's entry point: reads settings, builds the container, starts the bootstrap, and shuts down cleanly on SIGTERM or SIGINT with a time limit. |

### `apps/worker/src/bootstrap/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `system-principal.ts` | `SystemPrincipal`: the identity background jobs act as, per organization, with a short, reviewed list of permissions (never all of them) and a reserved user ID so audit rows do not look like a person. |
| `with-shard.ts` | `withShard`: runs a job's work placed on its organization's database node, as the web app does per request. |
| `worker-bootstrap.ts` | `WorkerBootstrap`: starts one BullMQ worker per queue with its consumer, runs the start-up partition check, registers every schedule, and on shutdown lets running jobs finish before closing connections. |

### `apps/worker/src/consumer/`

| File | What it does |
|---|---|
| `embedding.consumer.ts` | `EmbeddingConsumer`: runs queued document-indexing jobs (and, in the small kit, re-embedding after a model change). |
| `index.ts` | Folder barrel. |
| `mail.consumer.ts` | `MailConsumer`: sends queued emails, at most a set number per second for the provider, and logs a mail that finally failed after every retry. |
| `maintenance.consumer.ts` | `MaintenanceConsumer`: the housekeeping jobs: nightly cleanup of expired rows, monthly partition creation, the retention pass (storage lifecycle rules and 30-day sweep of deleted organizations), the orphan count, keeping spare partitions ready, tenant export and delete, re-rendering docs, and in the big kit restoring months and moving tenants. |
| `notification.consumer.ts` | `NotificationConsumer`: delivers notifications for events, and at 07:00 queues one digest job per organization, then sends each. |
| `outbox.consumer.ts` | `OutboxConsumer`: every second, drains each database node's outbox: claims unsent events, puts one job per subscriber on the queue, and marks them sent. Also runs those subscriber jobs and reports how far behind the outbox is. |

### `apps/worker/src/schedule/`

| File | What it does |
|---|---|
| `cleanup.schedule.ts` | `CleanupSchedule`: queues the nightly cleanup of expired sessions, tokens, invitations, overrides and adjustments at 03:00. |
| `digest.schedule.ts` | `DigestSchedule`: queues the daily notification digest at 07:00 UTC. |
| `index.ts` | Folder barrel. |
| `orphans.schedule.ts` | `OrphansSchedule`: queues the nightly count of rows left behind by deleted organizations at 04:00. |
| `outbox-drain.schedule.ts` | `OutboxDrainSchedule`: queues the outbox drain every second. |
| `partitions.schedule.ts` | `PartitionsSchedule`: queues partition creation at 02:00 on the first of each month, and runs it once at every start-up. |
| `retention.schedule.ts` | `RetentionSchedule`: queues the daily retention pass at 03:30. |
| `spares.schedule.ts` | `SparesSchedule`: every five minutes, tops up the pool of pre-made organization partitions so sign-ups stay fast. |

### `apps/worker/tests/bootstrap/`

| File | What it does |
|---|---|
| `system-principal.spec.ts` | Tests the worker's identity: narrow permissions, a reserved user ID. |
| `worker-bootstrap.spec.ts` | Tests `worker-bootstrap.ts`. |

### `apps/worker/tests/consumer/`

| File | What it does |
|---|---|
| `mail.consumer.spec.ts` | Tests `mail.consumer.ts`. |
| `maintenance.consumer.spec.ts` | Tests every housekeeping job. |
| `notification.consumer.spec.ts` | Tests `notification.consumer.ts`. |
| `outbox.consumer.spec.ts` | Tests `outbox.consumer.ts`. |

### `apps/worker/docs/`

| File | What it does |
|---|---|
| `index.md` | The background process. Five consumers, seven schedules, one container — and a single recurring failure it is shaped to prevent: work that stops quietly and looks exactly like work that is running. |
| `meta.json` | Sidebar order. |

### `apps/worker/docs/reference/`

| File | What it does |
|---|---|
| `consumers.md` | Five consumers, all with a public handle() — the batch sizes and why they are what they are, and the failure each one exists to make visible. |
| `env.md` | The second and last process.env reader — why its schema is smaller than the web app's, why the two are deliberately not shared, and what each concurrency value is protecting. |
| `meta.json` | Sidebar order. |
| `schedules.md` | Seven repeatable entries and one boot job, the fixed job ids that make registration idempotent, the clock order that keeps them off each other's locks, and why only one of them retries. |
| `shutdown.md` | What stop() drains, the race that bounds it, the order everything closes in, and why a second signal joins the drain instead of ending it. |
| `subscribers.md` | The contract every outbox subscriber keeps — idempotent on the event id, no ordering, never logs — and why they live in application rather than beside the consumer. |
