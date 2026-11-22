---
title: redis
description: One instance for the cache, the queue and realtime — durable, never evicts — every flag explained, and why the cache and the queue keep separate URLs.
---

# `redis`

One container, three jobs — the cache, BullMQ's queue and live frames — configured for the one that
cannot lose data: the queue.

| | `redis` |
| --- | --- |
| **Inside the network** | `redis:6379` |
| **From the host** | `localhost:26379` (`REDIS_PORT`) |
| **Eviction** | `noeviction` |
| **Persistence** | AOF |
| **Volume** | `redisdata` |
| **Holds** | capability cache, session cache, BullMQ jobs, pub/sub frames |
| **If flushed** | **lost work** — the queue goes with the cache |

`REDIS_CACHE_URL` and `REDIS_QUEUE_URL` both point at it, **on different databases** — cache on `/1`,
queue on `/0`. `CacheStore.deletePrefix` runs `SCAN MATCH`, which walks one database; sharing one,
every role or grant change walked every BullMQ key too (250 round trips beside 50,000 queue keys,
twice per change, `BL.17`). Live frames follow the cache URL; pub/sub is not tied to a database.

---

## Why one, and why two URLs

**Cache and sessions are cache-aside** (`CapabilityCache` → `PgCapabilityRepository`, Better Auth's
secondary storage → the Postgres `session` table): losing them costs latency. **A BullMQ job is derived
from nothing** — no table rebuilds it ([derived-store test](../../opinions/data-and-scale.md)). One
instance forces one policy: `allkeys-lru` silently deletes queued jobs; `noeviction` makes a full cache
error.

**Lite picks `noeviction`, and the cache pays:** every cache key carries a TTL so stale entries expire,
but a full instance is still an error. **The URLs stay separate anyway** — splitting onto two instances
is two `.env` lines and a compose block ([split-redis](../../scale/split-redis.md)), worth doing once
the cache wants `allkeys-lru` or flushing it alone matters.

---

## The flags

```yaml
redis:
  command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
```

- **`--appendonly yes`** journals every write, so a crash loses at most the last fsync window — what
  makes the volume meaningful.
- **`--maxmemory-policy noeviction`** errors when full instead of deleting. A failed `enqueue` is a
  failed request; a silently evicted job is a customer asking why nothing happened.

**So both job sets are capped:** completed jobs kept an hour, max 1,000 per queue; failed jobs a week,
max 10,000. The failed set is the dead letter (`pnpm queue:replay <queue>`), and the cap stops a
failure storm filling a `noeviction` instance that would then refuse every enqueue. Likewise an
embedding job carries its text's bucket key, never the text (up to 100 KB).

> **AOF covers a crash, not `FLUSHALL`.** Hence a nightly sweep re-enqueueing unprocessed work,
> reconciled against Postgres rather than BullMQ job records, which age out in an hour.

---

## How the application picks one

`RedisConnection` takes the URLs and hands out the right client per job:

```ts
redis.client()           // cacheUrl    — prefixed, for RedisCacheStore
redis.queueClient()      // queueUrl    — maxRetriesPerRequest: null, for BullMQ
redis.realtimeClient()   // realtimeUrl — live frames; the cache client itself when unset
redis.subscriberClient() // realtimeUrl — subscriber mode, opened by the first stream
```

Locally every URL names the one instance (`localhost:26379`). **One class, several URLs**, so the
connection follows what a consumer does — two bare `Redis` arguments to `Container` have the same type,
and swapping them compiles.

- **`maxRetriesPerRequest: null` on the queue client** — BullMQ's blocking commands stay open, and
  ioredis's default retry limit kills them: workers stop consuming after minutes, with no error.
- **A key prefix on the cache client, none on the queue client** — ioredis prepends it transparently,
  right for cache keys and breaking for BullMQ.

> **Sessions stay in Postgres; Redis is only a read-through.** Lite never evicts, but a TTL expires a
> cached session, and a split Redis would evict — either way a missing session is a miss, never a
> sign-out.

### A separate instance for live frames

`REDIS_REALTIME_URL` is optional; unset or equal to `REDIS_CACHE_URL`, `realtimeClient()` **is** the
cache client. Set it apart once wide fan-out (many publishes) competes with sign-in and permission
reads. Pub/sub keeps nothing, but watch `client-output-buffer-limit pubsub`: a lagging subscriber is
**disconnected** at the limit, ending and resyncing every stream on that process at once.

---

## Checking it

```bash
C="docker compose -f infra/docker-compose.yml"
$C exec redis redis-cli config get maxmemory-policy   # noeviction
$C exec redis redis-cli config get appendonly         # yes
```

**Never `flushall` with work pending** — the queue shares the instance. Clearing only the cache needs
the split ([split-redis](../../scale/split-redis.md)).
