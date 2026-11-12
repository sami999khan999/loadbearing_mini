import type { Locale, NotificationKind } from "../import.js";

// One browser push (`26.3`): VAPID-signed and encrypted to the subscription's keys. `gone`
// is the push service saying the subscription is dead, and the caller deletes it.
export abstract class PushSender {
  public abstract send(subscription: PushTarget, payload: PushPayload): Promise<"sent" | "gone">;
}

export interface PushTarget {
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

// The kind, never the message: the words are the kind's copy in the recipient's locale,
// so no message body ever leaves for a push service.
export interface PushPayload {
  readonly kind: NotificationKind;
  readonly link: string | null;
  readonly locale: Locale;
}
