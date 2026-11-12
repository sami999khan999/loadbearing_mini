import { describe, expect, it } from "vitest";
import { NotificationContract } from "../../src/notification/notification.contract.js";

// `26.3`: push is a third channel, and a digest of pushes means nothing.
describe("NotificationContract, push", () => {
  const update = NotificationContract.preferenceUpdate;

  it("takes push at immediate or off, never digest", () => {
    expect(update.safeParse({ category: "membership", channel: "push", mode: "off" }).success).toBe(
      true,
    );
    expect(
      update.safeParse({ category: "membership", channel: "push", mode: "digest" }).success,
    ).toBe(false);
    expect(
      update.safeParse({ category: "membership", channel: "email", mode: "digest" }).success,
    ).toBe(true);
  });

  // A push service is reached over TLS; anything else is not a browser's subscription.
  it("takes only an https endpoint", () => {
    const keys = { p256dh: "BPk", auth: "c2VjcmV0" };
    expect(
      NotificationContract.pushSubscription.safeParse({ endpoint: "https://push.test/a", keys })
        .success,
    ).toBe(true);
    expect(
      NotificationContract.pushSubscription.safeParse({ endpoint: "http://push.test/a", keys })
        .success,
    ).toBe(false);
  });
});
