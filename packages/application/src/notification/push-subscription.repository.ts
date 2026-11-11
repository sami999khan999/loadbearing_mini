import type { OrganizationId, UserId } from "../import.js";
import type { PushTarget } from "../port/index.js";

export interface PushSubscriptionRecord extends PushTarget {
  readonly userId: UserId;
}

export abstract class PushSubscriptionRepository {
  // Upsert on `(organization_id, endpoint)`: a browser re-subscribing, or handed to another
  // person on the same machine, moves the one row rather than adding a second.
  public abstract save(
    organizationId: OrganizationId,
    userId: UserId,
    target: PushTarget,
  ): Promise<void>;

  // One query for a delivery's whole audience.
  public abstract forUsers(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<readonly PushSubscriptionRecord[]>;

  // Scoped to the user on unsubscribe; unscoped when the push service said `gone`.
  public abstract delete(
    organizationId: OrganizationId,
    endpoint: string,
    userId: UserId | null,
  ): Promise<void>;
}
