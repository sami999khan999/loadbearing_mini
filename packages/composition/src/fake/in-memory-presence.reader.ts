import { type OrganizationId, PresenceReader, type UserId } from "../import.js";

// Online is whoever a spec says is: `online` is the set it holds.
export class InMemoryPresenceReader extends PresenceReader {
  public constructor(public readonly present: ReadonlySet<string> = new Set()) {
    super();
  }

  public override online(
    _organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<ReadonlySet<UserId>> {
    return Promise.resolve(new Set(userIds.filter((userId) => this.present.has(userId))));
  }
}
