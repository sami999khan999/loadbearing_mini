import { Identifiers } from "@loadbearing/contracts";
import { describe, expect, it } from "vitest";
import type {
  ConversationParticipant,
  ConversationRepository,
} from "../../src/messaging/conversation.repository.js";
import { ConversationAccess } from "../../src/messaging/conversation-access.js";
import { WatchConversationUseCase } from "../../src/messaging/watch-conversation.use-case.js";
import { Principal } from "../../src/primitive/index.js";
import {
  ADA,
  authorizer,
  CONVERSATION,
  GRACE,
  ORG,
  OUTSIDER,
  principal,
} from "./messaging-harness.js";

const OTHER_ROOM = Identifiers.conversationId.parse("018f8c00-0000-7000-8000-0000000000c2");

// Ada is in both rooms and Grace in the first; the double records every batch it is asked.
function watchWith() {
  const asked: (readonly ConversationParticipant[])[] = [];
  const members = new Set([
    `${CONVERSATION}:${ADA}`,
    `${OTHER_ROOM}:${ADA}`,
    `${CONVERSATION}:${GRACE}`,
  ]);
  const repository = {
    findMemberships: (
      _organizationId: unknown,
      participants: readonly ConversationParticipant[],
    ) => {
      asked.push(participants);
      return Promise.resolve(
        participants.filter((entry) => members.has(ConversationAccess.keyOf(entry))),
      );
    },
  } as unknown as ConversationRepository;

  return {
    asked,
    watch: new WatchConversationUseCase(authorizer, new ConversationAccess(repository)),
  };
}

// `RV.4`. The per-minute check for every held stream of a tenant: the same two questions
// `execute` asks, answered in order, with one membership read for all of them.
describe("WatchConversationUseCase.canWatchAll", () => {
  it("answers each stream in order, from one membership read", async () => {
    const { asked, watch } = watchWith();

    const answers = await watch.canWatchAll(ORG, [
      { actor: principal(ADA), conversationId: CONVERSATION },
      { actor: principal(GRACE), conversationId: OTHER_ROOM },
      { actor: principal(OUTSIDER), conversationId: CONVERSATION },
      { actor: principal(ADA), conversationId: OTHER_ROOM },
    ]);

    expect(answers).toEqual([true, false, false, true]);
    expect(asked).toHaveLength(1);
  });

  // The permission is asked before the room: a member whose role lost the read is refused
  // without being looked up, exactly as `execute` refuses with `FORBIDDEN`.
  it("refuses a member who no longer holds the read, and asks nothing for them", async () => {
    const { asked, watch } = watchWith();

    const answers = await watch.canWatchAll(ORG, [
      { actor: principal(ADA, []), conversationId: CONVERSATION },
    ]);

    expect(answers).toEqual([false]);
    expect(asked).toHaveLength(0);
  });

  it("refuses a principal of another tenant rather than looking it up under this one", async () => {
    const { asked, watch } = watchWith();
    const elsewhere = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-0000000000ee");
    const stranger = new Principal(elsewhere, ADA, principal(ADA).capabilities);

    expect(
      await watch.canWatchAll(ORG, [{ actor: stranger, conversationId: CONVERSATION }]),
    ).toEqual([false]);
    expect(asked).toHaveLength(0);
  });
});
