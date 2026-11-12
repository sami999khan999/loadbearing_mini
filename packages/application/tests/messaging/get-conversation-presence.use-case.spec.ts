import { Identifiers } from "@loadbearing/contracts";
import { ForbiddenError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type { ConversationAccess } from "../../src/messaging/conversation-access.js";
import { GetConversationPresenceUseCase } from "../../src/messaging/get-conversation-presence.use-case.js";
import type { PresenceReader } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ADA = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const GRACE = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000012");
const ROOM = "018f8c00-0000-7000-8000-0000000000c1" as never;

const actor = (grants: readonly PermissionKey[]) =>
  new Principal(
    ORG,
    ADA,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );

const build = (member: boolean) => {
  const access = {
    assertMember: () =>
      member
        ? Promise.resolve({ members: [{ userId: ADA }, { userId: GRACE }] })
        : Promise.reject(new ForbiddenError("messaging.conversation.read")),
  } as unknown as ConversationAccess;
  const presence = {
    online: (_org: unknown, userIds: readonly string[]) =>
      Promise.resolve(new Set(userIds.filter((userId) => userId === GRACE))),
  } as unknown as PresenceReader;
  return new GetConversationPresenceUseCase(new Authorizer(), access, presence);
};

describe("GetConversationPresenceUseCase", () => {
  it("names the members who have the app open", async () => {
    expect(await build(true).execute(actor(["messaging.conversation.read"]), ROOM)).toEqual({
      online: [GRACE],
    });
  });

  it("tells someone outside the room nothing", async () => {
    await expect(
      build(false).execute(actor(["messaging.conversation.read"]), ROOM),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
