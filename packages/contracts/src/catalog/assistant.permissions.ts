import type { PermissionKey } from "../import.js";

// One key for the whole slice: a thread is private to its author, so whoever may ask may
// also read, rename and delete what they asked. Authorship is each use-case's check.
export const assistantProcedurePermissions = {
  "assistant.list": "ai.assistant.use",
  "assistant.get": "ai.assistant.use",
  "assistant.send": "ai.assistant.use",
  "assistant.cancel": "ai.assistant.use",
  "assistant.rename": "ai.assistant.use",
  "assistant.remove": "ai.assistant.use",
} as const satisfies Record<string, PermissionKey>;
