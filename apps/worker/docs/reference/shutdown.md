---
title: Shutdown
description: What stop() drains, the race that bounds it, the order everything closes in, and why a second signal joins the drain instead of ending it.
---

# Shutdown

```
SIGTERM → stop(signal) → workers close (bounded) → redis close → container.dispose() → exit 0
```

## `close()` drains; the race bounds it

`close()` waits for in-flight jobs (a killed job is redelivered and redone). The race against
`WORKER_SHUTDOWN_TIMEOUT_MS` is the backstop: **a job that never returns must not outlive the platform's
SIGKILL timer** — set it below that. The timer is `unref()`ed so it cannot hold the loop open.

## The close order

1. **Workers**, so nothing new is accepted and in-flight work finishes.
2. **Redis**, once nothing is consuming.
3. **`container.dispose()` last** — everything above may still log
   ([reverse construction order](../../../../packages/composition/docs/reference/container.md)).

## `stop()` is idempotent, and the second caller *joins*

A SIGINT during a SIGTERM drain must not double-close (an unhandled rejection from a closed client).
`this.draining ??= this.drain(signal)` returns the same promise. **Returning it is half the guard:** an
early return that resolves would let `main.ts`'s `.then(() => process.exit(0))` exit **mid-close** — no
`process.stopped`, Redis open. A `close()` rejecting after the backstop is logged, not fatal: its handler
is attached *before* the race, else it lands in `unhandledRejection` and exits 1 after a good shutdown.

## The worker's own Redis connection

`main.ts` builds its own `RedisConnection`, keeping `Container.redis` private and consuming independent
of publishing. **It must be a `RedisConnection`**, not `{ host, port }` — that applies
`maxRetriesPerRequest: null`, without which BullMQ's blocking commands hit the retry limit and **consuming
stops silently.**

## The signal and failure handlers

- `unhandledRejection`/`uncaughtException` register **before** `start()`, so boot throws reach the same
  log stream (Node's default is a bare stderr stack). The shutdown `.catch` logs, never a bare `exit(1)`.
- Signal handlers attach to the `start()` promise, so a signal **during** boot drains once consumers
  exist instead of Node's default on a half-booted worker.
- **That wait is bounded at five seconds** (`BOOT_GRACE_MS`): `start()` blocks on an unreachable queue
  Redis, and an unbounded wait ran no shutdown until SIGKILL. On timeout it logs and exits non-zero —
  nothing started, so there is nothing to drain.
- Top-level `await` works: ESM, ES2024, NodeNext.

## `consumers` on the started line

`process.started` reports `consumers` and `queues` from the lanes the supervisor actually started
(`WORKER_QUEUES`), so a specialised service is told apart from one serving everything.
