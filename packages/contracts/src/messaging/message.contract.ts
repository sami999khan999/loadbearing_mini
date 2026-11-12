import { z } from "../import.js";
import { Identifiers } from "../primitive/index.js";

// Long enough for a paragraph, short enough that a row is one page read. A composer that
// needs more wants an attachment, which is a different feature.
const BODY_MAX = 4_000;

// Smaller than the keyset default: a message page is rendered all at once and each row
// is taller than a list row.
const PAGE_MAX = 50;

// The reactions a message can carry (`26.1`), closed: a free-form emoji is a string column
// anyone can fill with anything, and six cover what a team says without typing.
const emoji = z.enum(["👍", "❤️", "😂", "🎉", "😮", "🙏"]);

// What a message may carry (`26.1`): documents and images, never anything a browser runs.
const attachmentType = z.enum([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
]);

// Ten megabytes and five a message: a conversation is not a file store.
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ATTACHMENTS_MAX = 5;

const attachment = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(200),
  contentType: attachmentType,
  size: z.number().int().nonnegative(),
});

export class MessageContract {
  private constructor() {}

  public static readonly entity = z.object({
    id: Identifiers.messageId,
    conversationId: Identifiers.conversationId,
    authorId: Identifiers.userId,
    // Echoed back so the client can replace its optimistic row by the key it invented,
    // rather than by guessing which arriving message is the one it sent.
    clientId: z.uuid(),
    // Empty when `deleted`. The row survives so the conversation keeps its shape and
    // the keyset cursor over it stays stable.
    body: z.string(),
    deleted: z.boolean(),
    editedAt: z.date().nullable(),
    createdAt: z.date(),
    // Each emoji with how many reacted and whether the reader did. Empty on a send.
    reactions: z
      .array(z.object({ emoji, count: z.number().int().positive(), mine: z.boolean() }))
      .readonly()
      .default([]),
    // Files the message carries, oldest first. Each opens through `message.attachmentUrl`.
    attachments: z.array(attachment).readonly().default([]),
    // The message this one replies to, or null for one in the room itself (`26.1`).
    parentId: Identifiers.messageId.nullable().default(null),
    // How many replies a top-level message has. Zero on a reply, which has none.
    replyCount: z.number().int().nonnegative().default(0),
  });

  // A thread, oldest first from its root, as a conversation reads forwards from there.
  public static readonly threadQuery = z.object({
    conversationId: Identifiers.conversationId,
    messageId: Identifiers.messageId,
    // The root's time: replies are never older, so the read starts in its month.
    createdAt: z.coerce.date(),
    limit: z.number().int().positive().max(PAGE_MAX).default(30),
    after: z.string().max(256).optional(),
  });

  public static readonly emoji = emoji;

  // `on` adds the reader's reaction, off takes it away; either twice is a no-op. The time is
  // the message's, which is how the row is found in its month.
  public static readonly react = z.object({
    conversationId: Identifiers.conversationId,
    messageId: Identifiers.messageId,
    createdAt: z.coerce.date(),
    emoji,
    on: z.boolean(),
  });

  // Its own query rather than `Keyset.query`: a message list pages **backwards** from
  // the newest, which is a different cursor direction and a different default size.
  public static readonly listQuery = z.object({
    conversationId: Identifiers.conversationId,
    limit: z.number().int().positive().max(PAGE_MAX).default(30),
    // Older than this cursor. Absent means the newest page, which is what a freshly
    // opened conversation wants.
    before: z.string().max(256).optional(),
  });

  // Its own page shape rather than `Keyset.page`, and the field name says which way it
  // goes: `nextCursor` would read as "newer", which is the opposite of what it means.
  public static readonly page = z.object({
    items: z.array(MessageContract.entity).readonly(),
    // Null is the start of the conversation. Not the same as an empty page: a full page
    // can still be the oldest one.
    olderCursor: z.string().nullable(),
    // Set on the oldest page when earlier months are in cold storage (`26.4`): the first
    // of the newest archived month, `YYYY-MM-01`. Absent or null, nothing is archived.
    archivedThrough: z.string().nullable().optional(),
  });

  public static readonly threadPage = z.object({
    items: z.array(MessageContract.entity).readonly(),
    // Null is the end of the thread so far.
    newerCursor: z.string().nullable(),
    // The root's month is in cold storage, so the replies have no message to hang from.
    rootArchived: z.boolean().optional(),
  });

  public static readonly send = z
    .object({
      conversationId: Identifiers.conversationId,
      body: z.string().max(BODY_MAX),
      // The optimistic key **and** the dedupe key, generated by the client. A retried
      // send carries the same one and produces one row.
      clientId: z.uuid(),
      // Uploaded already, through `message.attachmentUpload`. The size is read from storage.
      attachments: z
        .array(attachment.omit({ size: true }))
        .max(ATTACHMENTS_MAX)
        .default([]),
      // A reply (`26.1`): the root it answers, with its time as the partition hint.
      parent: z.object({ messageId: Identifiers.messageId, createdAt: z.coerce.date() }).optional(),
    })
    // Text, a file, or both, but never neither.
    .refine((send) => send.body.trim().length > 0 || send.attachments.length > 0, {
      path: ["body"],
      message: "empty",
    });

  public static readonly ATTACHMENT_MAX_BYTES = ATTACHMENT_MAX_BYTES;
  public static readonly attachmentType = attachmentType;

  // One signed direct upload into the room, for the uploader alone to attach.
  public static readonly attachmentUpload = z.object({
    conversationId: Identifiers.conversationId,
    contentType: attachmentType,
    // Declared, so a too-big file fails early; the signed policy is what stops the bytes.
    size: z.number().int().positive().max(ATTACHMENT_MAX_BYTES),
  });

  public static readonly attachmentUploaded = z.object({
    attachmentId: z.uuid(),
    post: z.object({ url: z.string(), fields: z.record(z.string(), z.string()) }),
  });

  // A short-lived link to one attachment, for a member of its room.
  public static readonly attachmentLink = z.object({
    conversationId: Identifiers.conversationId,
    attachmentId: z.uuid(),
    // The message's time, which is how the row is found in its month.
    createdAt: z.coerce.date(),
  });

  public static readonly attachmentUrl = z.object({ url: z.string() });

  public static readonly edit = z.object({
    conversationId: Identifiers.conversationId,
    messageId: Identifiers.messageId,
    createdAt: z.date(),
    body: z.string().min(1).max(BODY_MAX),
  });

  public static readonly remove = z.object({
    conversationId: Identifiers.conversationId,
    messageId: Identifiers.messageId,
    createdAt: z.date(),
  });

  // Stores nothing and returns nothing. Rate-limited in the use-case, because a
  // keystroke-per-signal composer would publish forty frames a sentence.
  public static readonly typing = z.object({ conversationId: Identifiers.conversationId });
}

export type MessageDto = z.infer<typeof MessageContract.entity>;
export type MessagePage = z.infer<typeof MessageContract.page>;
export type ListMessagesInput = z.infer<typeof MessageContract.listQuery>;
export type SendMessageInput = z.infer<typeof MessageContract.send>;
export type EditMessageInput = z.infer<typeof MessageContract.edit>;
export type DeleteMessageInput = z.infer<typeof MessageContract.remove>;
export type TypingInput = z.infer<typeof MessageContract.typing>;
export type MessageEmoji = z.infer<typeof MessageContract.emoji>;
export type ReactToMessageInput = z.infer<typeof MessageContract.react>;
export type MessageAttachmentDto = z.infer<typeof attachment>;
export type MessageAttachmentType = z.infer<typeof MessageContract.attachmentType>;
export type RequestAttachmentUploadInput = z.infer<typeof MessageContract.attachmentUpload>;
export type AttachmentUploadDto = z.infer<typeof MessageContract.attachmentUploaded>;
export type AttachmentLinkInput = z.infer<typeof MessageContract.attachmentLink>;
export type ListThreadInput = z.infer<typeof MessageContract.threadQuery>;
export type MessageThreadPage = z.infer<typeof MessageContract.threadPage>;
