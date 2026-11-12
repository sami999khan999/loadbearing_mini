import type {
  ApiClient,
  ListNotificationsInput,
  MarkNotificationReadInput,
  UpdateNotificationPreferenceInput,
} from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";
import { PUSH_WORKER } from "./notification.queries.js";

// Derived, never restated: the envelope is inferred per procedure, and a local interface
// that drifted from it would be written back into the cache by `setQueryData`.
type Page = Awaited<ReturnType<ApiClient["notification"]["list"]>>;
type Pages = { readonly pages: readonly Page[]; readonly pageParams: readonly unknown[] };
type Count = Awaited<ReturnType<ApiClient["notification"]["unreadCount"]>>;

export class NotificationMutations {
  private constructor() {}

  // Optimistic on the list the row is on, because marking read is the one interaction
  // here that has to feel instant — it happens on click, on a row already on screen.
  public static useMarkRead(client: ApiClient, params: Omit<ListNotificationsInput, "cursor">) {
    return useAppMutation<{ ok: true }, MarkNotificationReadInput, Pages>({
      mutationFn: (input) => client.notification.markRead(input),
      // The count too: the badge is a separate key, and a row cleared without it goes
      // grey while the bell still claims one.
      invalidates: [QueryKeys.notification.all()],
      optimistic: {
        queryKey: QueryKeys.notification.list(params),
        apply: (cached, { id }) => ({
          ...cached,
          pages: cached.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === id ? { ...item, readAt: new Date() } : item,
            ),
          })),
        }),
      },
    });
  }

  // Optimistic on the count rather than the list: "clear everything" is judged by the
  // badge going to zero, and the list refetches behind it.
  public static useMarkAllRead(client: ApiClient) {
    return useAppMutation<{ ok: true }, void, Count>({
      mutationFn: () => client.notification.markAllRead(),
      invalidates: [QueryKeys.notification.all()],
      optimistic: {
        queryKey: QueryKeys.notification.unreadCount(),
        apply: () => ({ count: 0 }),
      },
    });
  }

  // Not optimistic. A preference is a form control the person is looking at, and a
  // rollback on failure would flip the select back under their cursor.
  public static useUpdatePreference(client: ApiClient) {
    return useAppMutation<{ ok: true }, UpdateNotificationPreferenceInput>({
      mutationFn: (input) => client.notification.updatePreference(input),
      invalidates: [QueryKeys.notification.preferences()],
    });
  }

  // Register the worker, ask the browser for permission and a subscription, and hand it to
  // the server (`26.3`). A refused permission throws, and nothing reaches the server.
  public static useEnablePush(client: ApiClient) {
    return useAppMutation<{ ok: true }, { readonly publicKey: string }>({
      mutationFn: async ({ publicKey }) => {
        const registration = await navigator.serviceWorker.register(PUSH_WORKER);
        await navigator.serviceWorker.ready;
        if ((await Notification.requestPermission()) !== "granted") throw new Error("FORBIDDEN");
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: NotificationMutations.keyBytes(publicKey),
        });
        const json = subscription.toJSON();
        return client.notification.pushSubscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        });
      },
      invalidates: [QueryKeys.notification.pushDevice()],
    });
  }

  // The server's row first, so a browser that fails to unsubscribe is still never pushed.
  public static useDisablePush(client: ApiClient) {
    return useAppMutation<{ ok: true }, undefined>({
      mutationFn: async () => {
        const registration = await navigator.serviceWorker.getRegistration(PUSH_WORKER);
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) return { ok: true as const };
        await client.notification.pushUnsubscribe({ endpoint: subscription.endpoint });
        await subscription.unsubscribe();
        return { ok: true as const };
      },
      invalidates: [QueryKeys.notification.pushDevice()],
    });
  }

  // The VAPID key is base64url; `subscribe` wants the bytes.
  private static keyBytes(key: string): Uint8Array<ArrayBuffer> {
    const base64 = key
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(key.length / 4) * 4, "=");
    return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  }
}
