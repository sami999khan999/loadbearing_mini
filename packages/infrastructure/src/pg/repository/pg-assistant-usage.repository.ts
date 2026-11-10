import {
  type AssistantUsageRecord,
  type AssistantUsageRepository,
  type AssistantUsageTotal,
  and,
  eq,
  gte,
  type OrganizationId,
  type Placement,
  sql,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { aiUsage } from "../schema/index.js";

export class PgAssistantUsageRepository extends BaseRepository implements AssistantUsageRepository {
  protected override readonly placement: Placement = "routed";

  public async save(usage: AssistantUsageRecord): Promise<void> {
    await this.db.insert(aiUsage).values(usage);
  }

  // Bounded below, so the read prunes to the months it covers.
  public async totalSince(
    organizationId: OrganizationId,
    since: Date,
  ): Promise<AssistantUsageTotal> {
    const [row] = await this.db
      .select({
        inputTokens: sql<string>`coalesce(sum(${aiUsage.inputTokens}), 0)`,
        outputTokens: sql<string>`coalesce(sum(${aiUsage.outputTokens}), 0)`,
      })
      .from(aiUsage)
      .where(and(eq(aiUsage.organizationId, organizationId), gte(aiUsage.createdAt, since)));
    return {
      inputTokens: Number(row?.inputTokens ?? 0),
      outputTokens: Number(row?.outputTokens ?? 0),
    };
  }
}
