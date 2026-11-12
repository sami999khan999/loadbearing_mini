import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError, NotFoundError } from "@loadbearing/errors";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type { ConversationAccess } from "../../src/messaging/conversation-access.js";
import type { MessageAttachmentRepository } from "../../src/messaging/message-attachment.repository.js";
import { OpenAttachmentUseCase } from "../../src/messaging/open-attachment.use-case.js";
import { RequestAttachmentUploadUseCase } from "../../src/messaging/request-attachment-upload.use-case.js";
import type { StorageGateway } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ADA = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const GRACE = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000012");
const ROOM = Identifiers.conversationId.parse("018f8c00-0000-7000-8000-0000000000c1");
const FILE = "018f8c00-0000-7000-8000-0000000000f1";
const AT = new Date("2026-11-01T00:00:00Z");

const actor = () =>
  new Principal(
    ORG,
    ADA,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: ["messaging.conversation.read", "messaging.message.send"], denies: [] },
      goals: {},
    }),
  );

const access = (member: boolean) =>
  ({
    assertParticipant: () =>
      member
        ? Promise.resolve({})
        : Promise.reject(new ForbiddenError("messaging.conversation.read")),
  }) as unknown as ConversationAccess;

const signed: string[] = [];
const storage = {
  presignPost: (key: string) => {
    signed.push(key);
    return Promise.resolve({ url: "https://bucket.test", fields: { key } });
  },
  presignDownload: (key: string) => Promise.resolve(`https://bucket.test/${key}?sig`),
} as unknown as StorageGateway;

describe("RequestAttachmentUploadUseCase", () => {
  it("signs an upload under the room and the uploader's own prefix", async () => {
    const result = await new RequestAttachmentUploadUseCase(
      new Authorizer(),
      access(true),
      storage,
    ).execute(actor(), { conversationId: ROOM, contentType: "application/pdf", size: 1024 });

    expect(signed.at(-1)).toBe(`msg/${ORG}/${ROOM}/${ADA}/${result.attachmentId}`);
  });
});

describe("OpenAttachmentUseCase", () => {
  const attachments = (found: boolean) =>
    ({
      findById: () =>
        Promise.resolve(
          found
            ? {
                id: FILE,
                organizationId: ORG,
                conversationId: ROOM,
                messageId: "m",
                uploaderId: GRACE,
                name: "plan.pdf",
                contentType: "application/pdf",
                size: 10,
                createdAt: AT,
              }
            : null,
        ),
    }) as unknown as MessageAttachmentRepository;

  const input = { conversationId: ROOM, attachmentId: FILE, createdAt: AT };

  it("links a member to the file under its uploader's prefix", async () => {
    const result = await new OpenAttachmentUseCase(
      new Authorizer(),
      access(true),
      attachments(true),
      storage,
    ).execute(actor(), input);
    expect(result.url).toBe(`https://bucket.test/msg/${ORG}/${ROOM}/${GRACE}/${FILE}?sig`);
  });

  it("answers not found for a file that is not in the room", async () => {
    await expect(
      new OpenAttachmentUseCase(
        new Authorizer(),
        access(true),
        attachments(false),
        storage,
      ).execute(actor(), input),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses someone outside the room", async () => {
    await expect(
      new OpenAttachmentUseCase(
        new Authorizer(),
        access(false),
        attachments(true),
        storage,
      ).execute(actor(), input),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
