// "Assistant" and "question", never "chat" or "conversation": those are Messaging's.
export const assistant = {
  "assistant.title": "Assistant",
  "assistant.intro": "Ask about anything in the docs and documents you can read.",

  "assistant.threads.title": "Your questions",
  "assistant.threads.empty": "Nothing asked yet.",
  "assistant.threads.error": "Your questions could not be loaded.",
  "assistant.threads.loadMore": "Load more",
  "assistant.threads.new": "New question",

  "assistant.thread.error": "This thread could not be loaded.",
  "assistant.thread.rename": "Rename",
  "assistant.thread.renameTitle": "Rename this thread",
  "assistant.thread.renameLabel": "Title",
  "assistant.thread.save": "Save",
  "assistant.thread.delete": "Delete",
  "assistant.thread.deleteConfirm": "Delete “{title}”?",
  "assistant.thread.deleteBody": "Its questions and answers are removed for good.",

  "assistant.ask.placeholder": "Ask a question",
  "assistant.ask.submit": "Ask",
  "assistant.ask.hint": "Enter to ask, Shift+Enter for a new line",
  "assistant.ask.failed": "That question was not sent.",

  "assistant.you": "You",
  "assistant.answer.waiting": "Waiting for its turn…",
  "assistant.answer.writing": "Writing…",
  "assistant.answer.stop": "Stop",
  "assistant.answer.cancelled": "Stopped.",
  "assistant.answer.interrupted": "This answer was cut off. Ask again to finish it.",
  "assistant.answer.failed": "This answer could not be written.",
  "assistant.answer.reconnecting": "Reconnecting…",

  "assistant.sources.title": "Sources",
  // A source the reader lost access to since the answer: its title, never a link.
  "assistant.sources.unavailable": "No longer available to you",

  "assistant.usage.title": "Usage",
  "assistant.usage.today": "{tokens} of {limit} tokens used today.",
  "assistant.usage.todayUncapped": "{tokens} tokens used today.",
  // Label and count, since `Translator` does not pluralise: "1 answers" otherwise.
  "assistant.usage.month": "This month: {tokens} tokens. Answers: {answers}.",
} as const;
