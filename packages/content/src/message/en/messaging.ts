// Chat copy is short on purpose: a label beside a message competes with the message.
export const messaging = {
  "messaging.inbox.title": "Messages",
  "messaging.inbox.empty": "No conversations yet. Start one to see it here.",
  "messaging.inbox.error": "Your conversations could not be loaded.",
  "messaging.inbox.loadMore": "Load older",
  "messaging.inbox.open": "Open messages",
  "messaging.inbox.unread": "{count} unread",
  "messaging.inbox.direct": "Direct message",
  // The name of whoever is no longer resolvable. A member can outlive the row that
  // named them, and "Direct message" for a person reads as a bug rather than as a gap.
  "messaging.member.unknown": "Someone",

  "messaging.conversation.empty": "No messages yet. Say something.",
  "messaging.conversation.error": "This conversation could not be loaded.",
  "messaging.conversation.loadOlder": "Load older messages",
  "messaging.conversation.archived":
    "Messages up to {month} are archived. A platform administrator can restore them.",
  "messaging.thread.rootArchived":
    "The start of this thread is archived. A platform administrator can restore it.",
  "messaging.conversation.deleted": "This message was deleted.",
  "messaging.conversation.edited": "edited",
  "messaging.conversation.leave": "Leave conversation",
  "messaging.conversation.members": "In this conversation",

  "messaging.compose.placeholder": "Write a message",
  "messaging.compose.send": "Send",
  // Enter sends and Shift+Enter breaks the line, which is the convention every chat
  // client shares — saying so once is cheaper than everyone discovering it.
  "messaging.compose.hint": "Enter to send, Shift+Enter for a new line",
  "messaging.compose.tooLong": "That message is too long.",
  "messaging.compose.failed": "That message was not sent.",

  "messaging.create.title": "New conversation",
  "messaging.create.submit": "Start",
  "messaging.create.name": "Name",
  "messaging.create.people": "People",
  "messaging.create.hint":
    "One person and no name starts a direct message; a name or more people make a group.",
  "messaging.create.nobody": "Nobody else is in this organization yet.",

  "messaging.typing.one": "{name} is typing…",
  "messaging.typing.many": "Several people are typing…",
  // Who has the app open, under the title (`26.6`). Names, then a comma list.
  "messaging.presence.online": "Online now: {names}",
  "messaging.compose.mention": "Mention…",
  // Reactions (`26.1`): a label and a count, because `Translator` does not pluralise.
  "messaging.reaction.add": "React",
  "messaging.reaction.toggle": "{emoji} reactions: {count}",
  // Files on a message (`26.1`).
  "messaging.attachment.add": "Attach a file",
  "messaging.attachment.remove": "Remove {name}",
  "messaging.attachment.open": "Open {name}",
  "messaging.attachment.failed": "That file could not be uploaded.",
  "messaging.thread.reply": "Reply",
  "messaging.thread.replies": "Replies: {count}",
  "messaging.thread.title": "Thread",
  "messaging.thread.more": "Show more replies",
} as const;
