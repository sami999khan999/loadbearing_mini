import type { OrganizationId, UserId } from "../import.js";

export interface AssistantUsageRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly userId: UserId;
  readonly threadId: string;
  readonly messageId: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly createdAt: Date;
}

export interface AssistantUsageTotal {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

// The meter, append-only: one row per settled answer, in `ai_usage`.
export abstract class AssistantUsageRepository {
  public abstract save(usage: AssistantUsageRecord): Promise<void>;

  // One tenant's tokens since `since`, for the org admin's own usage view.
  public abstract totalSince(
    organizationId: OrganizationId,
    since: Date,
  ): Promise<AssistantUsageTotal>;
}
