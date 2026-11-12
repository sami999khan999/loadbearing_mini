import type { ConversationId, MessageEmoji, MessageId, OrganizationId, UserId } from "../import.js";
import type { ReactionSummary } from "./message.repository.js";

export interface MessageReactionKey {
  readonly organizationId: OrganizationId;
  readonly conversationId: ConversationId;
  readonly messageId: MessageId;
  // The message's own time: a reaction lives in its message's month, so a page of
  // messages finds its reactions in the months the page already read.
  readonly messageCreatedAt: Date;
  readonly userId: UserId;
  readonly emoji: MessageEmoji;
}

export abstract class MessageReactionRepository {
  // Both idempotent: adding twice keeps one row, removing what is not there does nothing.
  public abstract add(reaction: MessageReactionKey): Promise<void>;

  public abstract remove(reaction: MessageReactionKey): Promise<void>;

  // One statement for a page of messages, bounded by the page's oldest and newest times.
  public abstract summaries(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    messageIds: readonly MessageId[],
    from: Date,
    to: Date,
    viewer: UserId,
  ): Promise<ReadonlyMap<MessageId, readonly ReactionSummary[]>>;
}
