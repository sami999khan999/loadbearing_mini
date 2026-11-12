import type { MessageId } from "@loadbearing/contracts";
import { describe, expect, it } from "vitest";
import type { ConversationRepository } from "../../src/messaging/conversation.repository.js";
import { ConversationAccess } from "../../src/messaging/conversation-access.js";
import { ListThreadUseCase } from "../../src/messaging/list-thread.use-case.js";
import type { MessageRecord, MessageRepository } from "../../src/messaging/message.repository.js";
import {
  authorizer,
  CONVERSATION,
  conversation,
  membershipFrom,
  message,
  NOW,
  OUTSIDER,
  principal,
} from "./messaging-harness.js";

const ROOT = "018f8c00-0000-7000-8000-0000000000a9" as MessageId;

const build = (root: MessageRecord | null) => {
  const asked: unknown[][] = [];
  const messages = {
    findById: () => Promise.resolve(root),
    listReplies: (...args: unknown[]) => {
      asked.push(args);
      return Promise.resolve({ items: [message({ parentId: ROOT })], newerCursor: null });
    },
  } as unknown as MessageRepository;
  const access = new ConversationAccess({
    findMembership: membershipFrom(() => Promise.resolve(conversation())),
  } as unknown as ConversationRepository);
  return { asked, useCase: new ListThreadUseCase(authorizer, access, messages) };
};

const input = { conversationId: CONVERSATION, messageId: ROOT, createdAt: NOW, limit: 30 };

describe("ListThreadUseCase", () => {
  it("reads a root's replies from the root's own time", async () => {
    const { asked, useCase } = build(message({ id: ROOT }));

    const page = await useCase.execute(principal(), input);

    expect(asked[0]?.slice(2)).toEqual([ROOT, NOW, 30, null]);
    expect(page.items[0]).toMatchObject({ parentId: ROOT, reactions: [], attachments: [] });
  });

  // A reply is not a root, so it has no thread to open: one level deep.
  it("answers NOT_FOUND for a missing root or a reply", async () => {
    for (const root of [null, message({ id: ROOT, parentId: ROOT })]) {
      const { asked, useCase } = build(root);
      await expect(useCase.execute(principal(), input)).rejects.toThrow("NOT_FOUND");
      expect(asked).toEqual([]);
    }
  });

  it("refuses someone outside the room", async () => {
    const { useCase } = build(message({ id: ROOT }));

    await expect(useCase.execute(principal(OUTSIDER), input)).rejects.toThrow("FORBIDDEN");
  });
});
