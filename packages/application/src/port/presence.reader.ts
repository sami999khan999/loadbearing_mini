import type { OrganizationId, UserId } from "../import.js";

// Who has a stream open right now (`26.6`), from the realtime leases rather than a table:
// presence is derived and expires with the lease, so nothing ever writes it.
export abstract class PresenceReader {
  public abstract online(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<ReadonlySet<UserId>>;
}
