import type { RealtimeChannel, Redis } from "../import.js";

// Each open stream's lease, one sorted set per owner scored by expiry (`26.6`): the count
// across every process, and presence. A dead process's leases expire on their own.
export class StreamLease {
  // Renewed at a third of this while the stream is open, so a missed renewal is not an exit.
  public static readonly TTL_MS = 90_000;
  public static readonly RENEW_MS = 30_000;

  private constructor() {}

  public static keyOf(owner: RealtimeChannel | string): string {
    return `realtime:lease:{${owner}}`;
  }

  // Takes a lease unless the owner already holds `max` live ones. One round trip: expired
  // leases go, the new one is added, and the count decides whether it stays.
  public static async acquire(
    redis: Redis,
    owner: RealtimeChannel,
    streamId: string,
    max: number,
    now: number,
  ): Promise<boolean> {
    const key = StreamLease.keyOf(owner);
    const results = await redis
      .multi()
      .zremrangebyscore(key, "-inf", now)
      .zadd(key, now + StreamLease.TTL_MS, streamId)
      .zcard(key)
      .pexpire(key, StreamLease.TTL_MS)
      .exec();
    const count = Number(results?.[2]?.[1] ?? 0);
    if (count <= max) return true;
    await redis.zrem(key, streamId);
    return false;
  }

  public static async renew(redis: Redis, owner: RealtimeChannel, streamId: string, now: number) {
    const key = StreamLease.keyOf(owner);
    await redis
      .multi()
      .zadd(key, now + StreamLease.TTL_MS, streamId)
      .pexpire(key, StreamLease.TTL_MS)
      .exec();
  }

  public static async release(redis: Redis, owner: RealtimeChannel, streamId: string) {
    await redis.zrem(StreamLease.keyOf(owner), streamId);
  }

  // Which of these owners hold a live lease: one pipelined count per owner.
  public static async live(
    redis: Redis,
    owners: readonly string[],
    now: number,
  ): Promise<ReadonlySet<string>> {
    if (owners.length === 0) return new Set();
    const pipeline = redis.pipeline();
    for (const owner of owners) pipeline.zcount(StreamLease.keyOf(owner), now, "+inf");
    const results = (await pipeline.exec()) ?? [];
    return new Set(owners.filter((_, index) => Number(results[index]?.[1] ?? 0) > 0));
  }
}
