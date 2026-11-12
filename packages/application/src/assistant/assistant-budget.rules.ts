import { type Clock, type OrganizationId, RateLimitedError } from "../import.js";
import type { AssistantBudgetStore } from "./assistant-budget.store.js";

// The organization's daily token cap, `ASSISTANT_ORG_DAILY_TOKENS`. Checked before a
// question is queued and charged when its answer settles, so one in flight may finish over.
export class AssistantBudget {
  public constructor(
    private readonly store: AssistantBudgetStore,
    private readonly clock: Clock,
    // Zero or below is no cap: a deployment that meters nothing.
    private readonly dailyTokens: number,
  ) {}

  // `RATE_LIMITED`, which the client reads as "try later": tomorrow the count starts again.
  public async assertAvailable(organizationId: OrganizationId): Promise<void> {
    if (this.dailyTokens <= 0) return;
    const used = await this.store.used(organizationId, this.day());
    if (used >= this.dailyTokens) throw new RateLimitedError("assistant.budget");
  }

  public async charge(organizationId: OrganizationId, tokens: number): Promise<number> {
    if (tokens <= 0) return this.store.used(organizationId, this.day());
    return this.store.add(organizationId, this.day(), tokens);
  }

  // The UTC day, so every process and every timezone agree on when it turns over.
  private day(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }
}
