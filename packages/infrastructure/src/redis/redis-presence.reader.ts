import {
  type OrganizationId,
  PresenceReader,
  RealtimeChannels,
  type Redis,
  type UserId,
} from "../import.js";
import { StreamLease } from "./stream-lease.js";

// Presence read off the stream leases (`26.6`): online is "holds a live lease".
export class RedisPresenceReader extends PresenceReader {
  public constructor(private readonly redis: () => Redis) {
    super();
  }

  public override async online(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<ReadonlySet<UserId>> {
    const owners = userIds.map((userId) => RealtimeChannels.user(organizationId, userId));
    const live = await StreamLease.live(this.redis(), owners, Date.now());
    return new Set(userIds.filter((_, index) => live.has(owners[index] ?? "")));
  }
}
