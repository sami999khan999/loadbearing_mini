import { Identifiers } from "@loadbearing/contracts";
import { RateLimitedError } from "@loadbearing/errors";
import { describe, expect, it } from "vitest";
import { AssistantBudget } from "../../src/assistant/assistant-budget.rules.js";
import type { AssistantBudgetStore } from "../../src/assistant/assistant-budget.store.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");

class MapBudgetStore implements AssistantBudgetStore {
  public readonly days = new Map<string, number>();

  public add(_org: unknown, day: string, tokens: number): Promise<number> {
    const next = (this.days.get(day) ?? 0) + tokens;
    this.days.set(day, next);
    return Promise.resolve(next);
  }

  public used(_org: unknown, day: string): Promise<number> {
    return Promise.resolve(this.days.get(day) ?? 0);
  }
}

const clockAt = (iso: string) => ({ now: () => new Date(iso) });

describe("AssistantBudget", () => {
  it("allows a question until the day's tokens are spent, then refuses with RATE_LIMITED", async () => {
    const store = new MapBudgetStore();
    const budget = new AssistantBudget(store, clockAt("2026-10-14T23:00:00Z"), 1_000);

    await expect(budget.assertAvailable(ORG)).resolves.toBeUndefined();
    await budget.charge(ORG, 1_000);
    await expect(budget.assertAvailable(ORG)).rejects.toBeInstanceOf(RateLimitedError);
  });

  // The UTC day, whatever the server's timezone: every process agrees when it turns over.
  it("starts again on the next UTC day", async () => {
    const store = new MapBudgetStore();
    await new AssistantBudget(store, clockAt("2026-10-14T23:59:00Z"), 100).charge(ORG, 100);

    const tomorrow = new AssistantBudget(store, clockAt("2026-10-15T00:01:00Z"), 100);
    await expect(tomorrow.assertAvailable(ORG)).resolves.toBeUndefined();
    expect([...store.days.keys()]).toEqual(["2026-10-14"]);
  });

  it("treats a cap of zero as no cap, and a zero charge as no write", async () => {
    const store = new MapBudgetStore();
    const budget = new AssistantBudget(store, clockAt("2026-10-14T00:00:00Z"), 0);

    await budget.charge(ORG, 0);
    await expect(budget.assertAvailable(ORG)).resolves.toBeUndefined();
    expect(store.days.size).toBe(0);
  });
});
