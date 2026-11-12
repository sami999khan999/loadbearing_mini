import {
  type AttachmentUploadDto,
  MessageContract,
  type RequestAttachmentUploadInput,
  Uuid,
} from "../import.js";
import type { StorageGateway } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { ConversationAccess } from "./conversation-access.js";
import { MessageAttachmentKey } from "./message-attachment-key.js";

// Signs one direct upload into the room, under the uploader's own prefix (`26.1`). Storage
// enforces the type and the length; the send checks the bytes arrived.
export class RequestAttachmentUploadUseCase {
  private static readonly UPLOAD_TTL_SECONDS = 300;

  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
    private readonly storage: StorageGateway,
  ) {}

  public async execute(
    actor: Principal,
    input: RequestAttachmentUploadInput,
  ): Promise<AttachmentUploadDto> {
    this.authorizer.assert(actor, "messaging.message.send");
    await this.access.assertParticipant(actor, input.conversationId);

    const attachmentId = Uuid.v7();
    const post = await this.storage.presignPost(
      MessageAttachmentKey.key(
        actor.organizationId,
        input.conversationId,
        actor.userId,
        attachmentId,
      ),
      input.contentType,
      MessageContract.ATTACHMENT_MAX_BYTES,
      RequestAttachmentUploadUseCase.UPLOAD_TTL_SECONDS,
    );
    return { attachmentId, post };
  }
}
