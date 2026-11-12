import type { PermissionKey } from "../import.js";

// A permission here is necessary and never sufficient: every use-case also asserts
// membership of the conversation. See packages/application/docs/reference/messaging.md.
export const messagingProcedurePermissions = {
  "conversation.list": "messaging.conversation.read",
  "conversation.get": "messaging.conversation.read",
  "conversation.presence": "messaging.conversation.read",
  "conversation.create": "messaging.conversation.create",
  // Adding, removing and renaming are administration. Leaving is not — it is something
  // anyone in a conversation may always do.
  "conversation.addMember": "messaging.conversation.manage",
  "conversation.removeMember": "messaging.conversation.manage",
  "conversation.rename": "messaging.conversation.manage",
  "conversation.leave": "messaging.conversation.read",
  "conversation.markRead": "messaging.conversation.read",
  "message.list": "messaging.conversation.read",
  "message.thread": "messaging.conversation.read",
  "message.send": "messaging.message.send",
  // Reacting is saying something in the room, so it is gated as a message is.
  "message.react": "messaging.message.send",
  // Uploading is the first half of sending; opening a file is reading the room.
  "message.attachmentUpload": "messaging.message.send",
  "message.attachmentUrl": "messaging.conversation.read",
  "message.edit": "messaging.message.update",
  "message.remove": "messaging.message.update",
  // Typing is a read-shaped act: it says you are in the conversation, and someone who
  // may not send can still be typing into a composer they will be refused at.
  "message.typing": "messaging.conversation.read",
} as const satisfies Record<string, PermissionKey>;
