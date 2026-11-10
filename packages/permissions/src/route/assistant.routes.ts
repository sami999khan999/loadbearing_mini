import type { RoutePath } from "./index.js";

export const assistantRoutes = {
  index: "/assistant",
  thread: "/assistant/$threadId",
} as const satisfies Record<string, RoutePath>;
