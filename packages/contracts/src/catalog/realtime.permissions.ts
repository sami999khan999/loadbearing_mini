import type { PermissionKey } from "../import.js";

// `core.realtime.subscribe` rather than a slice key: the stream carries whatever the
// frames carry, and every one of those was authorised where it was produced.
export const realtimeProcedurePermissions = {
  "realtime.stream": "core.realtime.subscribe",
  // Authorship of the answer is the use-case's check, as membership is the conversation's.
  "realtime.assistant": "ai.assistant.use",
} as const satisfies Record<string, PermissionKey>;
