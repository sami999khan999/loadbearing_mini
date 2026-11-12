import { type PushPayload, PushSender, type PushTarget, webPush } from "../import.js";

// What the service worker shows, in the recipient's words. Rendered by the wiring package,
// which holds the copy; this adapter only signs, encrypts and sends.
export interface RenderedPush {
  readonly title: string;
  readonly body: string;
  readonly url: string | null;
}

export interface WebPushConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  // A `mailto:` or `https:` URL the push service may contact about this sender.
  readonly subject: string;
}

// A day: a push still queued past that is about something the bell already shows.
const TTL_SECONDS = 86_400;

export class WebPushSender extends PushSender {
  public constructor(
    private readonly config: WebPushConfig,
    private readonly render: (payload: PushPayload) => Promise<RenderedPush>,
  ) {
    super();
  }

  // 404 and 410 are the push service retiring the subscription; anything else is thrown,
  // so the caller can tell a dead device from a bad moment.
  public override async send(target: PushTarget, payload: PushPayload): Promise<"sent" | "gone"> {
    try {
      await webPush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(await this.render(payload)),
        {
          vapidDetails: {
            subject: this.config.subject,
            publicKey: this.config.publicKey,
            privateKey: this.config.privateKey,
          },
          TTL: TTL_SECONDS,
        },
      );
      return "sent";
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      throw error;
    }
  }
}
