import { Identifiers } from "@loadbearing/contracts";
import { ValidationError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { GetPushKeyUseCase } from "../../src/notification/get-push-key.use-case.js";
import type { PushSubscriptionRepository } from "../../src/notification/push-subscription.repository.js";
import { SubscribePushUseCase } from "../../src/notification/subscribe-push.use-case.js";
import { UnsubscribePushUseCase } from "../../src/notification/unsubscribe-push.use-case.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ADA = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

const actor = (grants: readonly PermissionKey[]) =>
  new Principal(
    ORG,
    ADA,
    CapabilitySet.from({ wildcard: false, org: { grants: [...grants], denies: [] }, goals: {} }),
  );
const member = actor(["notification.inbox.read", "notification.preference.update"]);
const unitOfWork = { run: (work: () => Promise<unknown>) => work() } as never;
const device = {
  endpoint: "https://push.test/a",
  keys: { p256dh: "BPk", auth: "c2VjcmV0" },
};

const recording = () => {
  const calls: unknown[][] = [];
  const repository = {
    save: (...args: unknown[]) => {
      calls.push(["save", ...args]);
      return Promise.resolve();
    },
    delete: (...args: unknown[]) => {
      calls.push(["delete", ...args]);
      return Promise.resolve();
    },
  } as unknown as PushSubscriptionRepository;
  return { calls, repository };
};

describe("push subscriptions (`26.3`)", () => {
  it("saves this device for the actor in the active tenant", async () => {
    const { calls, repository } = recording();

    await new SubscribePushUseCase(new Authorizer(), repository, unitOfWork, true).execute(
      member,
      device,
    );

    expect(calls).toEqual([
      ["save", ORG, ADA, { endpoint: device.endpoint, p256dh: "BPk", auth: "c2VjcmV0" }],
    ]);
  });

  // A row nothing can send to is a row nothing ever cleans up.
  it("refuses a subscription when the deployment has no keys", async () => {
    const { calls, repository } = recording();
    const useCase = new SubscribePushUseCase(new Authorizer(), repository, unitOfWork, false);

    await expect(useCase.execute(member, device)).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toEqual([]);
  });

  // An endpoint is not a secret, so the delete is scoped to the actor's own row.
  it("removes only the actor's own row", async () => {
    const { calls, repository } = recording();

    await new UnsubscribePushUseCase(new Authorizer(), repository, unitOfWork).execute(member, {
      endpoint: device.endpoint,
    });

    expect(calls).toEqual([["delete", ORG, device.endpoint, ADA]]);
  });

  it("refuses someone who may not change their preferences", async () => {
    const { repository } = recording();
    const reader = actor(["notification.inbox.read"]);

    await expect(
      new SubscribePushUseCase(new Authorizer(), repository, unitOfWork, true).execute(
        reader,
        device,
      ),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("answers the public key, or null when push is off", () => {
    expect(new GetPushKeyUseCase(new Authorizer(), "BPub").execute(member)).toEqual({
      publicKey: "BPub",
    });
    expect(new GetPushKeyUseCase(new Authorizer(), null).execute(member)).toEqual({
      publicKey: null,
    });
  });
});
