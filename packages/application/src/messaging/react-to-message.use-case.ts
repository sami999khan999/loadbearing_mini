import { type ReactToMessageInput, Uuid } from "../import.js";
import type { RealtimePublisher } from "../port/index.js";
import { type Authorizer, type Principal, RealtimeChannels } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessageReactionRepository } from "./message-reaction.repository.js";

// A member's reaction on a message in their room (`26.1`). Not an audit row and not a
// notification: it is the lightest thing a person can say.
export class ReactToMessageUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly reactions: MessageReactionRepository,
    private readonly realtime: RealtimePublisher,
  ) {}

  public async execute(actor: Principal, input: ReactToMessageInput): Promise<void> {
    this.authorizer.assert(actor, "messaging.message.send");
    await this.access.assertParticipant(actor, input.conversationId);

    const key = {
      organizationId: actor.organizationId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      messageCreatedAt: input.createdAt,
      userId: actor.userId,
      emoji: input.emoji,
    };
    if (input.on) await this.reactions.add(key);
    else await this.reactions.remove(key);

    // The room's open tabs refetch that message's page. Best effort, as every frame is.
    await this.realtime
      .publish(RealtimeChannels.conversation(actor.organizationId, input.conversationId), {
        kind: "event",
        id: Uuid.v7(),
        name: "message.edited",
        at: new Date(),
        payload: { conversationId: input.conversationId, messageId: input.messageId },
      })
      .catch(() => undefined);
  }
}
