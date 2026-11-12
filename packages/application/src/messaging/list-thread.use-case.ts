import { type ListThreadInput, NotFoundError } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessageRepository, ThreadPageResult } from "./message.repository.js";
import type { MessageAttachmentRepository } from "./message-attachment.repository.js";
import type { MessageReactionRepository } from "./message-reaction.repository.js";

// A root's replies, oldest first (`26.1`), with their reactions and files as the room's
// own page carries them. A member of the room reads every thread in it.
export class ListThreadUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly messages: MessageRepository,
    private readonly reactions: MessageReactionRepository | null = null,
    private readonly attachments: MessageAttachmentRepository | null = null,
  ) {}

  public async execute(actor: Principal, input: ListThreadInput): Promise<ThreadPageResult> {
    this.authorizer.assert(actor, "messaging.conversation.read");
    await this.access.assertParticipant(actor, input.conversationId);

    const root = await this.messages.findById(
      actor.organizationId,
      input.conversationId,
      input.messageId,
      input.createdAt,
    );
    if (!root || root.parentId !== null) throw new NotFoundError("message", input.messageId);

    const page = await this.messages.listReplies(
      actor.organizationId,
      input.conversationId,
      input.messageId,
      input.createdAt,
      input.limit,
      input.after ?? null,
    );
    if (page.items.length === 0) return page;

    const times = page.items.map((item) => item.createdAt.getTime());
    const [from, to] = [new Date(Math.min(...times)), new Date(Math.max(...times))];
    const ids = page.items.map((item) => item.id);
    const [summaries, files] = await Promise.all([
      this.reactions?.summaries(
        actor.organizationId,
        input.conversationId,
        ids,
        from,
        to,
        actor.userId,
      ),
      this.attachments?.forMessages(actor.organizationId, input.conversationId, ids, from, to),
    ]);
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        reactions: summaries?.get(item.id) ?? [],
        attachments: files?.get(item.id) ?? [],
      })),
    };
  }
}
