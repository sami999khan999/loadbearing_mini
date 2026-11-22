---
title: Fan-out
description: The three patterns that fail before the database does, measured against the running stack — what one change for twenty-five thousand people actually costs, and which of the three is the one to worry about.
---

# Fan-out

[Data and scale](../../../../docs/opinions/data-and-scale.md) §6 names three patterns no store choice
fixes. This measures them.

```bash
pnpm infra:up
FAN_OUT_SCALE=1000,10000,25000 pnpm smoke
```

Without the variable the suite skips. It writes a `users` row per recipient, **reused, never deleted**
(the fourth finding).

## What it measures

One tenant, `N` members, and the three paths one change triggers:

| Path | What it is | What is measured |
|---|---|---|
| Notification write amplification | one change, one row per recipient | `PgNotificationRepository.saveMany`, then the same records again |
| Digest fan-out | the nightly scan, keyset pages of 200 | `PgNotificationRecipientReader.organizationMembers` to exhaustion |
| Realtime fan-out | one frame per member, on that member's own channel | `RedisRealtimePublisher.publish`, `N` times |

Each is measured alone; statement counts come from drizzle's logger.

## The readings

Measured 2026-09-20 in the big kit, against the compose stack on one developer machine — Postgres and Redis in
Docker on the same host, 82 tenants. **Orders of magnitude, not promises** — runs vary milliseconds by a
tenth; statement and page counts never move.

| Recipients | Write | Statements | Replay | Digest | Pages | Publish, serial | Publish, chunked |
|---|---|---|---|---|---|---|---|
| 1 000 | 209 ms | 1 | 146 ms | 18 ms | 6 | 806 ms | **42 ms** |
| 10 000 | 1 826 ms | 10 | 1 123 ms | 144 ms | 51 | 8 053 ms | **289 ms** |
| 25 000 | 5 026 ms | 25 | 2 825 ms | 696 ms | 126 | 17 944 ms | **769 ms** |

The last two: the same `N` frames, `await` per frame versus `Promise.all` over chunks of 500.

## What they say

**The notification write is fine** — 25 000 rows, 25 statements, 0.2 ms a row, flat; the spec asserts
the statement count (what can silently break), not time. §6's warning is about the **table** (rows per
change), which is what the partitioning answers — and, in the big kit, the retention policy
([Retention](../../../../docs/scale/retention.md)).

**The replay costs half the write and writes nothing** — at-least-once makes redelivery normal, and
`ON CONFLICT DO NOTHING` still costs 2.8 s at 25 000. Budget for running twice. **Digest fan-out is cheap**
— one query per 200, tens of µs a recipient; §6's capability grouping is unneeded because the digest
reads each recipient's own rows.

**Realtime fan-out was the one to worry about, and the fix was four lines.** Eighteen seconds for
one frame to each of 25 000 members, dead linear at ~0.8 ms a publish — one serialised round trip each.
Not Postgres. Chunks of 500 take **769 ms** — ioredis multiplexes one socket, so a chunk is one write:
**twenty-three times faster**, 31 µs a frame.

**The loop is chunked** — `DeliverNotificationUseCase` notifies 100 at a time (audience capped at 500),
bounded rather than one `Promise.all`. Its saving is extrapolated, not measured — say so before anyone
quotes it. Not yet needed: **Redis Streams behind `RealtimeSubscriber`**.

## The fourth finding, which came from the teardown

**Deleting a `users` row costs a scan per tenant partition of any partitioned table with a foreign
key to `users`.** The cascade is a referential-integrity trigger on `users`, and it issues a
`DELETE … WHERE user_id = $1` with no partition key in the predicate — so the planner touches every
partition of that table whether or not a row is there.

In the big kit that table was `conversation_members`, and at 82 tenants deleting three hundred
synthetic users exceeded a thirty-second `statement_timeout`. **Lite has no partitioned table with a
key to `users`**, so the cost does not apply today. A new one would bring it back, and at a few
thousand tenants on a node a user delete would have to become a maintenance job.

The fixture still gives its people **deterministic ids and never deletes them**: the leak is bounded
by the largest scale ever run, and a run killed half way through leaves nothing unfindable.
