import { createFileRoute } from "@tanstack/react-router";

// The web push service worker (`26.3`), at the root so its scope is the whole app. No `.js`
// in the path: the dev server claims any `.js` path as a module and answers 404.
const WORKER = `
self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || "", {
      body: data.body || "",
      data: { url: data.url || null },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url;
  if (url) event.waitUntil(self.clients.openWindow(url));
});
`;

export const Route = createFileRoute("/push-worker")({
  server: {
    handlers: {
      // Revalidated on every load: a cached worker is one the next fix never reaches.
      GET: () =>
        new Response(WORKER, {
          headers: {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-cache",
          },
        }),
    },
  },
});
