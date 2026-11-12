import type {
  ConversationId,
  MessageAttachmentDto,
  MessageAttachmentType,
  MessageId,
  OrganizationId,
  UserId,
} from "../import.js";

export interface MessageAttachmentRecord {
  readonly id: string;
  readonly organizationId: OrganizationId;
  readonly conversationId: ConversationId;
  readonly messageId: MessageId;
  readonly uploaderId: UserId;
  readonly name: string;
  readonly contentType: MessageAttachmentType;
  readonly size: number;
  // The message's time, so a file is in its message's month, as a reaction is.
  readonly createdAt: Date;
}

export abstract class MessageAttachmentRepository {
  public abstract saveMany(attachments: readonly MessageAttachmentRecord[]): Promise<void>;

  // One statement for a page of messages, bounded by the page's oldest and newest times.
  public abstract forMessages(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    messageIds: readonly MessageId[],
    from: Date,
    to: Date,
  ): Promise<ReadonlyMap<MessageId, readonly MessageAttachmentDto[]>>;

  public abstract findById(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    attachmentId: string,
    createdAt: Date,
  ): Promise<MessageAttachmentRecord | null>;
}
