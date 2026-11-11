import type { ApiClient, ListNotificationsInput } from "../import.js";
import { infiniteQueryOptions, queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

type Page = Awaited<ReturnType<ApiClient["notification"]["list"]>>;

// The service worker's path, served by `apps/web`; its scope is the whole app.
export const PUSH_WORKER = "/push-worker";

export class NotificationQueries {
  private constructor() {}

  // Infinite rather than paged: the inbox is a scroll, and the cursor lives in the page
  // data so the query key stays the same for every page of one filter.
  public static list(client: ApiClient, params: Omit<ListNotificationsInput, "cursor">) {
    return infiniteQueryOptions({
      queryKey: QueryKeys.notification.list(params),
      queryFn: ({ pageParam }) =>
        client.notification.list({ ...params, ...(pageParam ? { cursor: pageParam } : {}) }),
      initialPageParam: undefined as string | undefined,
      // Null is the last page, and it is not `items.length < limit`: a full page can
      // still be the last one.
      getNextPageParam: (last: Page) => last.nextCursor ?? undefined,
      staleTime: 30_000,
    });
  }

  // No `refetchOnWindowFocus`: the stream invalidates this key the moment a row is
  // written, so refetching on every tab switch is a request that changes nothing.
  public static unreadCount(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.notification.unreadCount(),
      queryFn: () => client.notification.unreadCount(),
      staleTime: 30_000,
    });
  }

  // Rarely changes and only by this person's own hand, so the only thing that
  // invalidates it is their own mutation.
  public static preferences(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.notification.preferences(),
      queryFn: () => client.notification.preferences({}),
      staleTime: 300_000,
    });
  }

  // The VAPID key, null when the deployment sends no push (`26.3`). Fixed for the deploy.
  public static pushKey(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.notification.pushKey(),
      queryFn: () => client.notification.pushKey(),
      staleTime: Number.POSITIVE_INFINITY,
    });
  }

  // Whether this browser can push and is subscribed: `unsupported`, `off` or `on`. Asked of
  // the browser, because a subscription is a device's and the server cannot see which.
  public static pushDevice() {
    return queryOptions({
      queryKey: QueryKeys.notification.pushDevice(),
      queryFn: async (): Promise<"unsupported" | "off" | "on"> => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
        const registration = await navigator.serviceWorker.getRegistration(PUSH_WORKER);
        const subscription = await registration?.pushManager.getSubscription();
        return subscription ? "on" : "off";
      },
      staleTime: Number.POSITIVE_INFINITY,
    });
  }
}
