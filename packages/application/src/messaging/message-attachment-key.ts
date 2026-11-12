import type { ConversationId, OrganizationId, UserId } from "../import.js";

// Where an attachment's bytes live (`26.1`). The room and the uploader are in the key, so a
// send can attach only its own uploads to its own room, and a tenant delete sweeps one prefix.
export class MessageAttachmentKey {
  private constructor() {}

  public static key(
    organizationId: OrganizationId,
    conversationId: ConversationId,
    uploaderId: UserId,
    attachmentId: string,
  ): string {
    return `msg/${organizationId}/${conversationId}/${uploaderId}/${attachmentId}`;
  }

  public static tenantPrefix(organizationId: OrganizationId): string {
    return `msg/${organizationId}/`;
  }
}
