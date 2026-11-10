import { AssistantBudgetStore, type OrganizationId, type Redis } from "../import.js";

// Two days, so a count read just after midnight UTC is still the day it belongs to.
const TTL_SECONDS = 2 * 86_400;

// On the queue instance, which never evicts: an evicted count is a tenant's budget reset.
export class RedisAssistantBudgetStore extends AssistantBudgetStore {
  public constructor(private readonly redis: Redis) {
    super();
  }

  // `INCRBY` and the expiry in one `MULTI`, so no add lands on a key with no expiry.
  public override async add(
    organizationId: OrganizationId,
    day: string,
    tokens: number,
  ): Promise<number> {
    const results = await this.redis
      .multi()
      .incrby(RedisAssistantBudgetStore.key(organizationId, day), tokens)
      .expire(RedisAssistantBudgetStore.key(organizationId, day), TTL_SECONDS)
      .exec();
    return Number(results?.[0]?.[1] ?? 0);
  }

  public override async used(organizationId: OrganizationId, day: string): Promise<number> {
    return Number((await this.redis.get(RedisAssistantBudgetStore.key(organizationId, day))) ?? 0);
  }

  // Hash-tagged on the tenant, so a move to Redis Cluster keeps one tenant's keys together.
  private static key(organizationId: OrganizationId, day: string): string {
    return `assistant:budget:{${organizationId}}:${day}`;
  }
}
