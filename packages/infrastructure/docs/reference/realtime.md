---
title: Realtime
description: One subscriber connection per process, ref-counted channels, a bounded queue whose overflow is a resync rather than a dropped frame nobody hears about, and the short log a resume is replayed from.
---

# Realtime

Two adapters over Redis pub/sub on the **realtime** role — the cache instance unless
`REDIS_REALTIME_URL` sets one apart (fire-and-forget traffic wastes the queue's `noeviction`; when to
split: [`redis.md`](../../../../docs/infra/reference/redis.md)).

## One connection per process, not one per stream

A `SUBSCRIBE`d connection can run almost nothing else, so `"subscriber"` is its own `RedisRole` and
`RedisRealtimeSubscriber` demultiplexes every stream over one socket, routing by channel. One connection
per tab is what takes Redis down. The role opens on first use; `RedisConnection.opened(role)` checks
**without creating** (the worker reports `null`), and `healthy("subscriber")` PINGs the streams' own
connection.

- **In subscriber mode `PING` answers `["pong", ""]`, not `"PONG"`** — an equality test once marked the
  whole web process unhealthy whenever a stream was open. The smoke case asserts it **while a stream is
  open** (after unsubscribing it answers `"PONG"`).
- **It carries the cache client's key prefix** — irrelevant to `PUBLISH`/`SUBSCRIBE`, but keeps a move to
  key-declaring `SPUBLISH`/`SSUBSCRIBE` symmetric.

## Channels are ref-counted, and the last reader releases them

Two tabs on a channel are one `SUBSCRIBE`; the last out unsubscribes — a leaked one delivers to nobody
forever, invisibly.

## The queue is bounded and the overflow is honest

Each stream queues 256 by default. Overflow drops the **oldest** (dropping arrivals keeps a lagging
reader behind forever) and hands a **`resync`** first — an untold gap is a quietly wrong screen. A slow
tab costs a refetch, never process memory.

## The stream cap and presence come from leases (`26.6`)

Each stream holds a lease in `realtime:lease:{<user channel>}`, a sorted set scored by expiry (renewed
every 30 s, lasting 90); only `StreamLease` touches it.

- **The cap holds across processes** — one round trip drops expired leases, adds, counts; past
  `REALTIME_MAX_STREAMS_PER_USER` it gives the lease back and refuses `RATE_LIMITED`. The per-process count
  checks first.
- **Presence is a live lease** — `RedisPresenceReader` counts per member, pipelined; `conversation.presence`
  answers for one conversation. A dead process's readers go offline within 90 s.
- **Redis unreachable → no lease, not refusal**: the cap degrades to per-process, presence reads empty.

## A resume is replayed from a short log (`26.5`)

Each `event` frame is written twice in one `MULTI`: `XADD` to `realtime:log:<channel>`
(`app:realtime:log:…` on the wire — ioredis prefixes keys, not channels), a Stream trimmed to ~200 entries
expiring an hour after its last write, then `PUBLISH`. Logged first, so a seen frame is always in the log. Only `event` frames are logged and given an SSE id, so nothing else is ever
the point a client resumes from.

On resume, `lastEventId` becomes `after`. The subscriber attaches **first**, `XRANGE`s the log on a
non-subscriber client, queues everything past `after` ahead of live frames (deduped), or hands a `resync`
when `after` is gone. Multi-channel streams always resync — two logs share no order. **Cost:** an `XADD`
and `EXPIRE` per `PUBLISH`, same round trip, ~200 frames per active channel; losing the log costs only a
refetch.

## The cap counts user channels only

`maxStreamsPerUser` counts concurrent streams per **user** channel, which `RealtimeChannels.isUser`
identifies (counting a shared channel would cap the room). The per-process count is the cheap first
check; the lease set above holds it across processes.

## The maximum age is spread

Deadline `maxAgeMs × (0.9 + 0.2 × random)`, so a deploy's tabs do not all reopen together thirty minutes
later; a clean end reopens.

## Every frame is parsed, not cast

The contract coerces `at` (a string on the wire) — a cast `Date` that is not one fails wherever first
compared. An unparseable frame is dropped and the stream continues: one malformed publish must not end
everyone's.

## What the specs cover, and where

`tests/redis/redis-realtime.subscriber.spec.ts` covers the branches against a fake (demux, coercion,
drops, overflow `resync`, ref counts, the cap, non-user channels, max age). `tests/smoke/redis.smoke.spec.ts`
covers what no fake can: both sides' channel strings agree after ioredis, and `PING` answers in subscriber
mode.
