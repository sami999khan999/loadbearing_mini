import { type AttachmentLinkInput, NotFoundError } from "../import.js";
import type { StorageGateway } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import type { MessageAttachmentRepository } from "./message-attachment.repository.js";
import { MessageAttachmentKey } from "./message-attachment-key.js";

// A link to one file, for a member of its room, valid for minutes (`26.1`). Never a public
// URL: whoever leaves the room loses the files with the messages.
export class OpenAttachmentUseCase {
  private static readonly LINK_TTL_SECONDS = 300;

  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly attachments: MessageAttachmentRepository,
    private readonly storage: StorageGateway,
  ) {}

  public async execute(
    actor: Principal,
    input: AttachmentLinkInput,
  ): Promise<{ readonly url: string }> {
    this.authorizer.assert(actor, "messaging.conversation.read");
    await this.access.assertParticipant(actor, input.conversationId);

    const found = await this.attachments.findById(
      actor.organizationId,
      input.conversationId,
      input.attachmentId,
      input.createdAt,
    );
    if (!found) throw new NotFoundError("message.attachment", input.attachmentId);

    const key = MessageAttachmentKey.key(
      found.organizationId,
      found.conversationId,
      found.uploaderId,
      found.id,
    );
    return { url: await this.storage.presignDownload(key, OpenAttachmentUseCase.LINK_TTL_SECONDS) };
  }
}
