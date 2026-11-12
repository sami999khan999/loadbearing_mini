import type { ModuleGate } from "../registry/index.js";
import { ROUTES } from "../route/index.js";

export const assistantGates = {
  assistant: { permission: "ai.assistant.use", route: ROUTES.assistant.index },
} as const satisfies Record<string, ModuleGate>;
