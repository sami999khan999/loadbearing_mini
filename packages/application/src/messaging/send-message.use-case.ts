import {
  type Clock,
  ConflictError,
  type ConversationKind,
  type MessageId,
  NotFoundError,
  type SendMessageInput,
  type UserId,
  Uuid,
  ValidationError,
} from "../import.js";
import type {
  CacheStore,
  DomainEventPublisher,
  RealtimePublisher,
  StorageGateway,
  UnitOfWork,
} from "../port/index.js";
import { type Authorizer, type Principal, RealtimeChannels } from "../primitive/index.js";
import type { ConversationRepository } from "./conversation.repository.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessageRecord, MessageRepository } from "./message.repository.js";
import type { MessageAttachmentRepository } from "./message-attachment.repository.js";
import { MessageAttachmentKey } from "./message-attachment-key.js";

// A day. Long enough that no client retries past it, short enough that the dedupe set is
// bounded by a day of traffic rather than by the conversation's whole history.
const DEDUPE_TTL_SECONDS = 86_400;

// How long a claim whose row is not there yet reads as "still being written" rather than
// "rolled back". Longer than any send transaction, shorter than a person's patience.
const IN_FLIGHT_MS = 10_000;

// What the dedupe key holds: enough to find the row the first attempt wrote, and nothing
// else — `findById` carries `createdAt` as the partition hint.
interface HeldSend {
  readonly id: MessageId;
  readonly createdAt: string;
}

export class SendMessageUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly conversations: ConversationRepository,
    private readonly messages: MessageRepository,
    private readonly events: DomainEventPublisher,
    private readonly realtime: RealtimePublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly cache: CacheStore,
    private readonly clock: Clock,
    // Absent in a spec about text alone; a send naming a file then fails (`26.1`).
    private readonly files: {
      readonly attachments: MessageAttachmentRepository;
      readonly storage: StorageGateway;
    } | null = null,
  ) {}

  public async execute(actor: Principal, input: SendMessageInput): Promise<MessageRecord> {
    this.authorizer.assert(actor, "messaging.message.send");
    const conversation = await this.access.assertParticipant(actor, input.conversationId);

    // Before the claim, so a file that never arrived fails the send cleanly and a retry
    // after uploading it again is not mistaken for a duplicate.
    const sizes = await this.sizesOf(actor, input);
    await this.assertRoot(actor, input);

    // Generated here, not in the repository: the dedupe key holds them, which is what
    // lets a retry be handed the row the first attempt wrote.
    const id = Uuid.v7() as MessageId;
    const createdAt = this.clock.now();
    const key = SendMessageUseCase.key(actor, input.conversationId, input.clientId);

    // A unique index on `messages` would have to carry `created_at`, which a retry never
    // reproduces — so the dedupe is one `SET … EX … NX`. See docs/reference/messaging.md.
    const claimed = await this.cache.setIfAbsent<HeldSend>(
      key,
      { id, createdAt: createdAt.toISOString() },
      DEDUPE_TTL_SECONDS,
    );

    if (!claimed) {
      const previous = await this.cache.get<HeldSend>(key);
      const held = previous ? await this.replay(actor, input, previous) : null;

      // Returned without touching the conversation, the outbox or the fast path, so the
      // two attempts stay indistinguishable — which is what the old `DO UPDATE` bought.
      if (held) return held;

      // A claim whose row is not there *yet* is the first attempt still running, not a
      // rollback: its transaction is open, so `findById` cannot see what it wrote.
      if (previous && createdAt.getTime() - Date.parse(previous.createdAt) < IN_FLIGHT_MS) {
        throw new ConflictError("message", "inFlight");
      }

      // Past the window the first attempt is gone, and it rolled back after setting the
      // key. Take the claim over, so the next retry finds this attempt's row.
      await this.cache.set<HeldSend>(
        key,
        { id, createdAt: createdAt.toISOString() },
        DEDUPE_TTL_SECONDS,
      );
    }

    const message = await this.unitOfWork.run(() =>
      this.write(actor, input, conversation.kind, id, createdAt, sizes),
    );

    // The **fast path**, after the commit and best effort. The subscriber publishes the
    // same frame durably, and the client dedupes by message id — so a lost one costs nothing.
    await this.realtime.publish(
      RealtimeChannels.conversation(actor.organizationId, input.conversationId),
      {
        kind: "event",
        id: Uuid.v7(),
        name: "message.sent",
        at: message.createdAt,
        payload: { conversationId: input.conversationId, messageId: message.id },
      },
    );

    return message;
  }

  // Null means the claim is held and the row is not there — either the first attempt is
  // still inside its transaction, or it rolled back. The caller tells those apart.
  private async replay(
    actor: Principal,
    input: SendMessageInput,
    held: HeldSend,
  ): Promise<MessageRecord | null> {
    return this.messages.findById(
      actor.organizationId,
      input.conversationId,
      held.id,
      new Date(held.createdAt),
    );
  }

  // No `activity.record`. Chat volume is not an audit trail, and the outbox row is the
  // durable fact — writing both would double the write rate for nobody's benefit.
  private async write(
    actor: Principal,
    input: SendMessageInput,
    conversationKind: ConversationKind,
    id: MessageId,
    createdAt: Date,
    sizes: readonly number[],
  ): Promise<MessageRecord> {
    const message = await this.messages.save({
      id,
      createdAt,
      organizationId: actor.organizationId,
      conversationId: input.conversationId,
      authorId: actor.userId,
      clientId: input.clientId,
      body: input.body,
      parentId: input.parent?.messageId ?? null,
      parentCreatedAt: input.parent?.createdAt ?? null,
    });

    await this.conversations.touch(
      actor.organizationId,
      input.conversationId,
      message.id,
      message.createdAt,
    );

    const attachments = input.attachments.map((file, index) => ({
      id: file.id,
      name: file.name,
      contentType: file.contentType,
      size: sizes[index] ?? 0,
    }));
    if (attachments.length > 0 && this.files) {
      await this.files.attachments.saveMany(
        attachments.map((file) => ({
          ...file,
          organizationId: actor.organizationId,
          conversationId: input.conversationId,
          messageId: message.id,
          uploaderId: actor.userId,
          createdAt: message.createdAt,
        })),
      );
    }

    await this.events.publish(actor, {
      name: "message.sent",
      payload: {
        conversationId: input.conversationId,
        messageId: message.id,
        createdAt: message.createdAt,
        conversationKind,
        mentions: SendMessageUseCase.mentionsIn(input.body, actor.userId),
      },
    });

    // Only when there are some, so a retry's answer (which reads no files) matches.
    return attachments.length > 0 ? { ...message, attachments } : message;
  }

  // A reply answers a root in the same room, never another reply: threads are one level
  // deep (`26.1`), so a thread is read in one query and a root's count is one number.
  private async assertRoot(actor: Principal, input: SendMessageInput): Promise<void> {
    if (!input.parent) return;
    const root = await this.messages.findById(
      actor.organizationId,
      input.conversationId,
      input.parent.messageId,
      input.parent.createdAt,
    );
    if (!root || root.deleted) throw new NotFoundError("message", input.parent.messageId);
    if (root.parentId !== null) throw new ValidationError([{ field: "parent", rule: "nested" }]);
  }

  // Each named upload's stored size, read from storage: a file that is not there is a
  // client that skipped the upload or let its signature expire, and the send is refused.
  private async sizesOf(actor: Principal, input: SendMessageInput): Promise<readonly number[]> {
    if (input.attachments.length === 0) return [];
    if (!this.files) throw new ValidationError([{ field: "attachments", rule: "unsupported" }]);
    const files = this.files;
    const sizes = await Promise.all(
      input.attachments.map((file) =>
        files.storage.sizeOf(
          MessageAttachmentKey.key(
            actor.organizationId,
            input.conversationId,
            actor.userId,
            file.id,
          ),
        ),
      ),
    );
    if (sizes.some((size) => size === null)) {
      throw new ValidationError([{ field: "attachments", rule: "missing" }]);
    }
    return sizes as number[];
  }

  // The `<@id>` tokens the composer inserts (`26.7`), once each, never the author, at most
  // twenty: a message naming the whole room is a channel-wide ping, which this is not.
  private static mentionsIn(body: string, author: UserId): UserId[] {
    const found = new Set<string>();
    for (const match of body.matchAll(/<@([0-9a-f-]{36})>/g)) {
      if (match[1] && match[1] !== author) found.add(match[1]);
      if (found.size >= 20) break;
    }
    return [...found] as UserId[];
  }

  // Scoped to the conversation as well as the tenant, so two clients that happened to
  // generate one uuid do not collide across rooms — the old unique index's shape.
  private static key(actor: Principal, conversationId: string, clientId: string): string {
    return `message:client:${actor.organizationId}:${conversationId}:${clientId}`;
  }
}
