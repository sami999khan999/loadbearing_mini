import {
  and,
  asc,
  type ConversationId,
  eq,
  gte,
  inArray,
  lte,
  type MessageAttachmentDto,
  type MessageAttachmentRecord,
  type MessageAttachmentRepository,
  type MessageId,
  type OrganizationId,
  type Placement,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import { messageAttachments } from "../schema/index.js";

export class PgMessageAttachmentRepository
  extends BaseRepository
  implements MessageAttachmentRepository
{
  protected override readonly placement: Placement = "routed";

  public async saveMany(attachments: readonly MessageAttachmentRecord[]): Promise<void> {
    if (attachments.length === 0) return;
    await this.db.insert(messageAttachments).values([...attachments]);
  }

  public async forMessages(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    messageIds: readonly MessageId[],
    from: Date,
    to: Date,
  ): Promise<ReadonlyMap<MessageId, readonly MessageAttachmentDto[]>> {
    const found = new Map<MessageId, MessageAttachmentDto[]>();
    if (messageIds.length === 0) return found;

    const rows = await this.db
      .select()
      .from(messageAttachments)
      .where(
        and(
          eq(messageAttachments.organizationId, organizationId),
          eq(messageAttachments.conversationId, conversationId),
          gte(messageAttachments.createdAt, from),
          lte(messageAttachments.createdAt, to),
          inArray(messageAttachments.messageId, [...messageIds]),
        ),
      )
      .orderBy(asc(messageAttachments.id));

    for (const row of rows) {
      const list = found.get(row.messageId) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        contentType: row.contentType as MessageAttachmentDto["contentType"],
        size: row.size,
      });
      found.set(row.messageId, list);
    }
    return found;
  }

  public async findById(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    attachmentId: string,
    createdAt: Date,
  ): Promise<MessageAttachmentRecord | null> {
    const [row] = await this.db
      .select()
      .from(messageAttachments)
      .where(
        and(
          eq(messageAttachments.organizationId, organizationId),
          eq(messageAttachments.conversationId, conversationId),
          eq(messageAttachments.id, attachmentId),
          eq(messageAttachments.createdAt, createdAt),
        ),
      )
      .limit(1);
    return row
      ? { ...row, contentType: row.contentType as MessageAttachmentRecord["contentType"] }
      : null;
  }
}
