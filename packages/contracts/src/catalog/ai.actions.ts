export const aiActions = {
  "ai.document.indexed": { label: "Document indexed" },
  // The highest-volume action in the system and the first anyone will exclude, which
  // is most of why the projection policy is a row rather than a constant.
  "ai.document.searched": { label: "Document searched" },
  // A thread's start and end only. Each question is a message, not an audit fact, and
  // its cost is metered in `ai_usage`.
  "ai.assistant.thread.created": { label: "Assistant thread started" },
  "ai.assistant.thread.deleted": { label: "Assistant thread deleted" },
} as const;
