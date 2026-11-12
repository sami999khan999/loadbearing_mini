import {
  and,
  type ConversationId,
  eq,
  gte,
  inArray,
  lte,
  type MessageId,
  type MessageReactionKey,
  type MessageReactionRepository,
  type OrganizationId,
  type Placement,
  type ReactionSummary,
  sql,
  type UserId,
  Uuid,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { messageReactions } from "../schema/index.js";

export class PgMessageReactionRepository
  extends BaseRepository
  implements MessageReactionRepository
{
  protected override readonly placement: Placement = "routed";

  public async add(reaction: MessageReactionKey): Promise<void> {
    await this.db
      .insert(messageReactions)
      .values({
        id: Uuid.v7(),
        organizationId: reaction.organizationId,
        conversationId: reaction.conversationId,
        messageId: reaction.messageId,
        userId: reaction.userId,
        emoji: reaction.emoji,
        createdAt: reaction.messageCreatedAt,
      })
      .onConflictDoNothing();
  }

  public async remove(reaction: MessageReactionKey): Promise<void> {
    await this.db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.organizationId, reaction.organizationId),
          eq(messageReactions.messageId, reaction.messageId),
          eq(messageReactions.userId, reaction.userId),
          eq(messageReactions.emoji, reaction.emoji),
          eq(messageReactions.createdAt, reaction.messageCreatedAt),
        ),
      );
  }

  // Grouped in the database: one row per message and emoji, with the reader's own flag.
  public async summaries(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    messageIds: readonly MessageId[],
    from: Date,
    to: Date,
    viewer: UserId,
  ): Promise<ReadonlyMap<MessageId, readonly ReactionSummary[]>> {
    const found = new Map<MessageId, ReactionSummary[]>();
    if (messageIds.length === 0) return found;

    const rows = await this.db
      .select({
        messageId: messageReactions.messageId,
        emoji: messageReactions.emoji,
        count: sql<string>`count(*)`,
        mine: sql<boolean>`bool_or(${messageReactions.userId} = ${viewer}::uuid)`,
      })
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.organizationId, organizationId),
          eq(messageReactions.conversationId, conversationId),
          gte(messageReactions.createdAt, from),
          lte(messageReactions.createdAt, to),
          inArray(messageReactions.messageId, [...messageIds]),
        ),
      )
      .groupBy(messageReactions.messageId, messageReactions.emoji)
      .orderBy(messageReactions.messageId, messageReactions.emoji);

    for (const row of rows) {
      const list = found.get(row.messageId) ?? [];
      list.push({
        emoji: row.emoji as ReactionSummary["emoji"],
        count: Number(row.count),
        mine: Boolean(row.mine),
      });
      found.set(row.messageId, list);
    }
    return found;
  }
}
