import type { Clock } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type {
  AssistantUsageRepository,
  AssistantUsageTotal,
} from "./assistant-usage.repository.js";

export interface AssistantUsage {
  readonly today: AssistantUsageTotal;
  readonly month: AssistantUsageTotal;
  // `ASSISTANT_ORG_DAILY_TOKENS`; zero is no cap.
  readonly dailyTokenLimit: number;
}

// An org admin's view of its own tenant's assistant use: a tenant-scoped Postgres read,
// never the analytics store, so it works on a deployment that runs no ClickHouse.
export class GetAssistantUsageUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly usage: AssistantUsageRepository,
    private readonly clock: Clock,
    private readonly dailyTokenLimit: number,
  ) {}

  public async execute(actor: Principal): Promise<AssistantUsage> {
    this.authorizer.assert(actor, "ai.usage.read");

    // UTC midnights, the same day the budget counts in.
    const now = this.clock.now();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [todayTotal, monthTotal] = await Promise.all([
      this.usage.totalSince(actor.organizationId, today),
      this.usage.totalSince(actor.organizationId, month),
    ]);

    return {
      today: todayTotal,
      month: monthTotal,
      dailyTokenLimit: Math.max(0, this.dailyTokenLimit),
    };
  }
}
