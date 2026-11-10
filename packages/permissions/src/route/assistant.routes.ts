import type { RoutePath } from "./index.js";

// Declared ahead of the page, which arrives with the UI; its nav gate arrives with it.

export const assistantRoutes = {
  index: "/assistant",
  thread: "/assistant/$threadId",
} as const satisfies Record<string, RoutePath>;
