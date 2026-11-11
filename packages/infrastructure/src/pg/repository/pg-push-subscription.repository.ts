import {
  and,
  eq,
  inArray,
  type OrganizationId,
  type Placement,
  type PushSubscriptionRecord,
  type PushSubscriptionRepository,
  type PushTarget,
  type UserId,
  Uuid,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { pushSubscriptions } from "../schema/index.js";

export class PgPushSubscriptionRepository
  extends BaseRepository
  implements PushSubscriptionRepository
{
  // `push_subscriptions` is tenant-produced.
  protected override readonly placement: Placement = "routed";

  public async save(
    organizationId: OrganizationId,
    userId: UserId,
    target: PushTarget,
  ): Promise<void> {
    await this.db
      .insert(pushSubscriptions)
      .values({ id: Uuid.v7(), organizationId, userId, ...target })
      .onConflictDoUpdate({
        target: [pushSubscriptions.organizationId, pushSubscriptions.endpoint],
        set: { userId, p256dh: target.p256dh, auth: target.auth },
      });
  }

  public async forUsers(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<readonly PushSubscriptionRecord[]> {
    if (userIds.length === 0) return [];
    return this.db
      .select({
        userId: pushSubscriptions.userId,
        endpoint: pushSubscriptions.endpoint,
        p256dh: pushSubscriptions.p256dh,
        auth: pushSubscriptions.auth,
      })
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.organizationId, organizationId),
          inArray(pushSubscriptions.userId, [...userIds]),
        ),
      );
  }

  public async delete(
    organizationId: OrganizationId,
    endpoint: string,
    userId: UserId | null,
  ): Promise<void> {
    await this.db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.organizationId, organizationId),
          eq(pushSubscriptions.endpoint, endpoint),
          userId ? eq(pushSubscriptions.userId, userId) : undefined,
        ),
      );
  }
}
