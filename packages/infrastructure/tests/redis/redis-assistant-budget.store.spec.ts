import { Identifiers } from "@loadbearing/contracts";
import { describe, expect, it } from "vitest";
import type { Redis } from "../../src/import.js";
import { RedisAssistantBudgetStore } from "../../src/redis/redis-assistant-budget.store.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");

// The commands the store sends, in the order a `MULTI` would queue them.
class FakeRedis {
  public readonly sent: (readonly unknown[])[] = [];
  private readonly counts = new Map<string, number>();

  public multi() {
    const queued: (readonly unknown[])[] = [];
    const chain = {
      incrby: (key: string, by: number) => {
        queued.push(["incrby", key, by]);
        return chain;
      },
      expire: (key: string, seconds: number) => {
        queued.push(["expire", key, seconds]);
        return chain;
      },
      exec: () => {
        this.sent.push(["multi", ...queued]);
        const results = queued.map(([command, key, value]) => {
          if (command !== "incrby") return [null, 1];
          const next = (this.counts.get(String(key)) ?? 0) + Number(value);
          this.counts.set(String(key), next);
          return [null, next];
        });
        return Promise.resolve(results);
      },
    };
    return chain;
  }

  public get(key: string): Promise<string | null> {
    const count = this.counts.get(key);
    return Promise.resolve(count === undefined ? null : String(count));
  }
}

describe("RedisAssistantBudgetStore", () => {
  // In one `MULTI`, so no add can land on a key that has no expiry.
  it("adds and sets the expiry together, on a key tagged by tenant and day", async () => {
    const redis = new FakeRedis();
    const store = new RedisAssistantBudgetStore(redis as unknown as Redis);

    expect(await store.add(ORG, "2026-10-14", 120)).toBe(120);
    expect(await store.add(ORG, "2026-10-14", 30)).toBe(150);

    const key = `assistant:budget:{${ORG}}:2026-10-14`;
    expect(redis.sent[0]).toEqual(["multi", ["incrby", key, 120], ["expire", key, 172_800]]);
    expect(await store.used(ORG, "2026-10-14")).toBe(150);
  });

  it("reads an untouched day as zero", async () => {
    const store = new RedisAssistantBudgetStore(new FakeRedis() as unknown as Redis);
    expect(await store.used(ORG, "2026-10-15")).toBe(0);
  });
});
