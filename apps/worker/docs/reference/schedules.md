---
title: The schedules
description: Seven repeatable entries and one boot job, the fixed job ids that make registration idempotent, the clock order that keeps them off each other's locks, and why only one of them retries.
---

# The schedules

| Schedule | When | Queue |
|---|---|---|
| `outbox-drain` | every second | `EVENT` |
| `partitions-monthly` | 02:00 on the first | `MAINTENANCE` |
| `cleanup-daily` | 03:00 daily | `MAINTENANCE` |
| `retention-daily` | 03:30 daily | `MAINTENANCE` |
| `orphans-daily` | 04:00 daily | `MAINTENANCE` |
| `digest-daily` | 07:00 daily | `NOTIFICATION` |
| `spares-topup` | every five minutes | `MAINTENANCE` |

`partitions-boot` is not a repeatable entry: `runOnce()` adds it once at every boot, before the
schedules register. See the last section.

## The clock order is not arbitrary

On the first of the month the maintenance jobs run in this order, and for these reasons:

- **02:00 partitions.** A sweep that runs while the current month has no partition fails on a table
  it cannot write to, so the runway is extended before anything else touches `activity_log`.
- **03:00 cleanup.** After the runway exists.
- **03:30 retention, 04:00 orphans.** Neither runs DDL on a partition, so each wants only to be
  somewhere the other passes are not.

## Every time is UTC

BullMQ reads cron in the process timezone, so a non-UTC host ran nightly jobs at local hours (and the
digest's UTC day could be wrong). Each entry passes `tz: "UTC"` via `UtcCron`; since `tz` is part of the
key, registration first removes the old tz-less entry, else both run.

## A fixed job id is what makes registration idempotent

Every schedule registers on **every boot** — without a fixed id the nightly job runs eleven times by
Friday. The `Queue` is closed right after publishing (else a second connection for life). Schedules
register **after** consumers start, so an instant fire has a runner — a consumerless schedule once left
`cleanup-daily` silently accumulating.

## Only the digest retries

Maintenance entries run once: **the schedule is the retry** (all idempotent; an in-job retry would stack
DDL on held locks). `digest-daily` has five attempts backing off from a minute — one failed 07:00 fan-out
would be every tenant's digest.

## `partitions-monthly` has a real deadline

The baseline creates parents and no months; each tenant's come from this job (and spare seeding). **The
day a tenant's last month ends, every insert to its `activity_log` fails.** It walks
`PartitionedTable.MONTH_PARTITIONED`, logging `maintenance.partitions.ensured` per table and tenant as
fields — a new table is one list entry, each with its own deadline.

## `outbox-drain` is the only sub-minute schedule here

Every second — the outbox's commit-to-delivery budget. A poll on purpose: `LISTEN`/`NOTIFY` is the
upgrade once a measured budget under 500 ms is needed; a shorter interval multiplies empty queries. Fixed
`jobId`, `priority: 1` so its deliveries cannot starve it.

## Nothing here drops a month

`partitions-monthly` only ensures months ahead; lite retires none, so partitioned tables grow until you
port the pass ([`docs/scale/retention.md`](../../../../docs/scale/retention.md)). `retention-daily` touches
the bucket only: it converges the `export/` lifecycle rule and sweeps `cold/` archives of tenants deleted
over thirty days ago ([consumers](consumers.md)).

## A schedule fires once; the job it enqueues walks every node

No schedule has a shard dimension — per-node entries would need N-fold idempotency and deregistration
and would drift from the cluster. One entry; the consumer loops nodes ([consumers](consumers.md)). So
`runOnce()` at boot recovers the runway on **every** node.

**The boot job keeps no failure** (`CR.17`): `partitions-boot`'s fixed id dedupes replicas, but BullMQ
ignores an `add` whose id sits in the failed set — one boot with Postgres down once disabled recovery for
good. `removeOnFail: true`; the failure still logs `queue.job.failed`.

