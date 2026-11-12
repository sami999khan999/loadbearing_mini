import { oc } from "../import.js";
import { Envelope, Keyset } from "../primitive/index.js";
import { NotificationContract } from "./notification.contract.js";

export class NotificationProcedures {
  private constructor() {}

  public static readonly list = oc
    .route({ method: "GET", path: "/notifications" })
    .input(NotificationContract.listQuery)
    .output(Keyset.page(NotificationContract.entity));

  // Its own procedure rather than a field on the list: the bell is on every page and the
  // list is on one, so they have different cache lifetimes and different call rates.
  public static readonly unreadCount = oc
    .route({ method: "GET", path: "/notifications/unread-count" })
    .output(NotificationContract.unreadCount);

  public static readonly markRead = oc
    .route({ method: "POST", path: "/notifications/{id}/read" })
    .input(NotificationContract.markRead)
    .output(Envelope.acknowledged);

  // Separate from `markRead` rather than an optional id: "clear everything" is a
  // different intent, and one endpoint doing both makes an accidental empty body do it.
  public static readonly markAllRead = oc
    .route({ method: "POST", path: "/notifications/read-all" })
    .output(Envelope.acknowledged);

  public static readonly preferences = oc
    .route({ method: "GET", path: "/notifications/preferences" })
    .output(Envelope.paginated(NotificationContract.preference));

  public static readonly updatePreference = oc
    .route({ method: "PUT", path: "/notifications/preferences" })
    .input(NotificationContract.preferenceUpdate)
    .output(Envelope.acknowledged);

  // The VAPID public key a browser subscribes with (`26.3`).
  public static readonly pushKey = oc
    .route({ method: "GET", path: "/notifications/push/key" })
    .output(NotificationContract.pushKey);

  // This device, for the signed-in person in the active tenant. Saving one twice is one row.
  public static readonly pushSubscribe = oc
    .route({ method: "POST", path: "/notifications/push/subscriptions" })
    .input(NotificationContract.pushSubscription)
    .output(Envelope.acknowledged);

  public static readonly pushUnsubscribe = oc
    .route({ method: "POST", path: "/notifications/push/subscriptions/remove" })
    .input(NotificationContract.pushEndpoint)
    .output(Envelope.acknowledged);

  // The object the merge point in `procedure/index.ts` mounts. One place to add a
  // procedure to, rather than two.
  public static readonly all = {
    list: NotificationProcedures.list,
    unreadCount: NotificationProcedures.unreadCount,
    markRead: NotificationProcedures.markRead,
    markAllRead: NotificationProcedures.markAllRead,
    preferences: NotificationProcedures.preferences,
    updatePreference: NotificationProcedures.updatePreference,
    pushKey: NotificationProcedures.pushKey,
    pushSubscribe: NotificationProcedures.pushSubscribe,
    pushUnsubscribe: NotificationProcedures.pushUnsubscribe,
  } as const;
}
