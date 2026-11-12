import { describe, expect, it } from "vitest";
import type { RealtimeChannel, Redis } from "../../src/import.js";
import { StreamLease } from "../../src/redis/stream-lease.js";

// The sorted-set commands the lease uses, with Redis's semantics for each.
class FakeSortedSets {
  public readonly sets = new Map<string, Map<string, number>>();

  private set(key: string): Map<string, number> {
    const existing = this.sets.get(key);
    if (existing) return existing;
    const created = new Map<string, number>();
    this.sets.set(key, created);
    return created;
  }

  public zremrangebyscore(key: string, _min: string, max: number): number {
    let removed = 0;
    for (const [member, score] of this.set(key)) {
      if (score <= max) {
        this.set(key).delete(member);
        removed += 1;
      }
    }
    return removed;
  }

  public zadd(key: string, score: number, member: string): number {
    this.set(key).set(member, score);
    return 1;
  }

  public zcard(key: string): number {
    return this.set(key).size;
  }

  public zcount(key: string, min: number): number {
    return [...this.set(key).values()].filter((score) => score >= min).length;
  }

  public zrem(key: string, member: string): Promise<number> {
    return Promise.resolve(this.set(key).delete(member) ? 1 : 0);
  }

  public multi() {
    return this.batch();
  }

  public pipeline() {
    return this.batch();
  }

  private batch() {
    const calls: (() => unknown)[] = [];
    const chain = {
      zremrangebyscore: (k: string, a: string, b: number) => {
        calls.push(() => this.zremrangebyscore(k, a, b));
        return chain;
      },
      zadd: (k: string, s: number, m: string) => {
        calls.push(() => this.zadd(k, s, m));
        return chain;
      },
      zcard: (k: string) => {
        calls.push(() => this.zcard(k));
        return chain;
      },
      zcount: (k: string, min: number) => {
        calls.push(() => this.zcount(k, min));
        return chain;
      },
      pexpire: () => {
        calls.push(() => 1);
        return chain;
      },
      exec: () => Promise.resolve(calls.map((call) => [null, call()])),
    };
    return chain;
  }
}

const OWNER = "org:o:user:ada" as RealtimeChannel;
const OTHER = "org:o:user:grace" as RealtimeChannel;

describe("StreamLease", () => {
  it("holds the cap across every process, and frees a place on release", async () => {
    const fake = new FakeSortedSets();
    const redis = fake as unknown as Redis;

    expect(await StreamLease.acquire(redis, OWNER, "s1", 2, 0)).toBe(true);
    expect(await StreamLease.acquire(redis, OWNER, "s2", 2, 0)).toBe(true);
    expect(await StreamLease.acquire(redis, OWNER, "s3", 2, 0)).toBe(false);
    expect(fake.zcard(StreamLease.keyOf(OWNER))).toBe(2);

    await StreamLease.release(redis, OWNER, "s1");
    expect(await StreamLease.acquire(redis, OWNER, "s3", 2, 0)).toBe(true);
  });

  it("lets a dead process's leases expire, so they stop counting", async () => {
    const redis = new FakeSortedSets() as unknown as Redis;
    await StreamLease.acquire(redis, OWNER, "s1", 1, 0);

    expect(await StreamLease.acquire(redis, OWNER, "s2", 1, StreamLease.TTL_MS + 1)).toBe(true);
  });

  it("reads presence as holding a live lease", async () => {
    const redis = new FakeSortedSets() as unknown as Redis;
    await StreamLease.acquire(redis, OWNER, "s1", 5, 0);

    expect([...(await StreamLease.live(redis, [OWNER, OTHER], 1_000))]).toEqual([OWNER]);
    expect([...(await StreamLease.live(redis, [OWNER], StreamLease.TTL_MS + 1))]).toEqual([]);
  });
});
