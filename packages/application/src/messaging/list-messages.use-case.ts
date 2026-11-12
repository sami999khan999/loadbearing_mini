import type { ListMessagesInput } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessagePageResult, MessageRepository } from "./message.repository.js";
import type { MessageAttachmentRepository } from "./message-attachment.repository.js";
import type { MessageReactionRepository } from "./message-reaction.repository.js";

export class ListMessagesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly messages: MessageRepository,
    // Absent in a spec about paging alone; the page then carries no reactions.
    private readonly reactions: MessageReactionRepository | null = null,
    private readonly attachments: MessageAttachmentRepository | null = null,
  ) {}

  public async execute(actor: Principal, input: ListMessagesInput): Promise<MessagePageResult> {
    this.authorizer.assert(actor, "messaging.conversation.read");
    // The permission says this person may read conversations; this says which. A third
    // member of the organization gets FORBIDDEN here, not an empty page.
    const conversation = await this.access.assertParticipant(actor, input.conversationId);

    // No message yet is no page, and no query: nothing below the header can exist.
    if (!conversation.lastMessageAt) return { items: [], olderCursor: null };

    // The newest message's time bounds the first page, so it reads the months up to it
    // rather than every month `messages` holds. See docs/reference/messaging.md.
    const page = await this.messages.list(actor.organizationId, {
      conversationId: input.conversationId,
      limit: input.limit,
      before: input.before,
      upTo: conversation.lastMessageAt,
    });
    if (page.items.length === 0) return page;

    // One query for the page, inside the months it already read (`26.1`).
    const times = page.items.map((item) => item.createdAt.getTime());
    const [from, to] = [new Date(Math.min(...times)), new Date(Math.max(...times))];
    const ids = page.items.map((item) => item.id);
    const [summaries, files, replies] = await Promise.all([
      this.reactions?.summaries(
        actor.organizationId,
        input.conversationId,
        ids,
        from,
        to,
        actor.userId,
      ),
      this.attachments?.forMessages(actor.organizationId, input.conversationId, ids, from, to),
      this.messages.replyCounts(actor.organizationId, input.conversationId, ids, from),
    ]);
    return {
      ...page,
      items: page.items.map((item) => ({
        ...item,
        reactions: summaries?.get(item.id) ?? [],
        attachments: files?.get(item.id) ?? [],
        replyCount: replies.get(item.id) ?? 0,
      })),
    };
  }
}
