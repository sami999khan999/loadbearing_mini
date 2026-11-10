import type { PermissionMeta } from "../registry/index.js";

// The worker's grants live here rather than in a worker-local list, because a system
// principal naming a permission the catalog does not know must fail at boot (25.3).
export const aiPermissions = {
  "ai.embedding.write": {
    scope: "org",
    module: "ai",
    label: "Index documents for search",
    requires: ["ai.embedding.read"],
  },
  "ai.embedding.read": {
    scope: "org",
    module: "ai",
    label: "Search indexed documents",
  },
  // Not `requires` either search key: what it answers from is checked per source, so a
  // plan can sell the assistant without the index, and the other way round.
  "ai.assistant.use": {
    scope: "org",
    module: "ai",
    label: "Ask the assistant about what you can read",
  },
  // An administrator's view of the tenant's own spend. Not `requires` the use key: who
  // watches the meter need not ask questions.
  "ai.usage.read": {
    scope: "org",
    module: "ai",
    label: "View the organization's assistant usage",
  },
} as const satisfies Record<string, PermissionMeta>;
