import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError } from "@loadbearing/errors";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type { ConversationAccess } from "../../src/messaging/conversation-access.js";
import type { MessageReactionRepository } from "../../src/messaging/message-reaction.repository.js";
import { ReactToMessageUseCase } from "../../src/messaging/react-to-message.use-case.js";
import type { RealtimePublisher } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ADA = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const ROOM = Identifiers.conversationId.parse("018f8c00-0000-7000-8000-0000000000c1");
const MESSAGE = Identifiers.messageId.parse("018f8c00-0000-7000-8000-0000000000d1");

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

const build = (member: boolean) => {
  const calls: string[] = [];
  const frames: unknown[] = [];
  const access = {
    assertParticipant: () =>
      member
        ? Promise.resolve({})
        : Promise.reject(new ForbiddenError("messaging.conversation.read")),
  } as unknown as ConversationAccess;
  const reactions = {
    add: (key: { emoji: string }) => {
      calls.push(`add ${key.emoji}`);
      return Promise.resolve();
    },
    remove: (key: { emoji: string }) => {
      calls.push(`remove ${key.emoji}`);
      return Promise.resolve();
    },
  } as unknown as MessageReactionRepository;
  const realtime = {
    publish: (_channel: unknown, frame: unknown) => {
      frames.push(frame);
      return Promise.resolve();
    },
  } as unknown as RealtimePublisher;
  return {
    useCase: new ReactToMessageUseCase(new Authorizer(), access, reactions, realtime),
    calls,
    frames,
  };
};

const input = (on: boolean) => ({
  conversationId: ROOM,
  messageId: MESSAGE,
  createdAt: new Date("2026-11-01T00:00:00Z"),
  emoji: "👍" as const,
  on,
});

describe("ReactToMessageUseCase", () => {
  it("adds or removes the reader's reaction, and tells the room's open tabs", async () => {
    const { useCase, calls, frames } = build(true);

    await useCase.execute(actor(), input(true));
    await useCase.execute(actor(), input(false));

    expect(calls).toEqual(["add 👍", "remove 👍"]);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ name: "message.edited", payload: { messageId: MESSAGE } });
  });

  it("refuses someone outside the room, and writes nothing", async () => {
    const { useCase, calls } = build(false);

    await expect(useCase.execute(actor(), input(true))).rejects.toBeInstanceOf(ForbiddenError);
    expect(calls).toEqual([]);
  });
});
