import type { ConversationId, UserId } from "../import.js";
import type { PresenceReader } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";

// Who in this conversation has the app open (`26.6`). Members only see members: the
// roster check is the same one reading the conversation makes.
export class GetConversationPresenceUseCase {
  // A room past this shows its first members only: presence is a nicety, not a census.
  private static readonly MEMBER_LIMIT = 200;

  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly presence: PresenceReader,
  ) {}

  public async execute(
    actor: Principal,
    conversationId: ConversationId,
  ): Promise<{ readonly online: readonly UserId[] }> {
    this.authorizer.assert(actor, "messaging.conversation.read");
    const conversation = await this.access.assertMember(actor, conversationId);
    const members = conversation.members
      .slice(0, GetConversationPresenceUseCase.MEMBER_LIMIT)
      .map((member) => member.userId);
    const online = await this.presence.online(actor.organizationId, members);
    return { online: members.filter((userId) => online.has(userId)) };
  }
}
