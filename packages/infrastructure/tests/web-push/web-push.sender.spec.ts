import { afterEach, describe, expect, it, vi } from "vitest";
import { webPush } from "../../src/import.js";
import { WebPushSender } from "../../src/web-push/index.js";

const config = { publicKey: "BPub", privateKey: "priv", subject: "mailto:ops@example.test" };
const target = { endpoint: "https://push.test/a", p256dh: "k", auth: "a" };
const payload = {
  kind: "member.role.changed" as const,
  link: "/settings/members",
  locale: "en" as const,
};
const rendered = {
  title: "New message",
  body: "You have unread messages.",
  url: "https://app/messages/1",
};

afterEach(() => {
  vi.restoreAllMocks();
});

// `26.3`: what the push service answers decides whether the device is kept.
describe("WebPushSender", () => {
  it("sends the rendered words, signed with the deployment's keys", async () => {
    const send = vi.spyOn(webPush, "sendNotification").mockResolvedValue({} as never);

    const outcome = await new WebPushSender(config, () => Promise.resolve(rendered)).send(
      target,
      payload,
    );

    expect(outcome).toBe("sent");
    expect(send).toHaveBeenCalledWith(
      { endpoint: target.endpoint, keys: { p256dh: "k", auth: "a" } },
      JSON.stringify(rendered),
      expect.objectContaining({ vapidDetails: { ...config }, TTL: 86_400 }),
    );
  });

  it.each([404, 410])("reads %i as a subscription that is gone", async (statusCode) => {
    vi.spyOn(webPush, "sendNotification").mockRejectedValue({ statusCode });

    const sender = new WebPushSender(config, () => Promise.resolve(rendered));

    await expect(sender.send(target, payload)).resolves.toBe("gone");
  });

  // A bad moment, not a dead device: thrown, so the row is kept.
  it("throws anything else", async () => {
    vi.spyOn(webPush, "sendNotification").mockRejectedValue({ statusCode: 503 });

    const sender = new WebPushSender(config, () => Promise.resolve(rendered));

    await expect(sender.send(target, payload)).rejects.toEqual({ statusCode: 503 });
  });
});
