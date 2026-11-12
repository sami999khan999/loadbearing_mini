## What it is

**Messages** in the menu is chat between members of one organization. A conversation is either a
**direct message** between two people or a **channel** for a group.

## Why it exists

Members talk about the work where the work is, and every message stays inside the organization
like the rest of its data.

## How it works

- Each message is saved to the organization's own database, like every other record.
- The **live stream** (see [The live stream](/docs/admin-guide/realtime)) pushes each new message
  to everyone who has the conversation open, within about a second. "… is typing…" travels the
  same way.
- Retention never deletes messages. They are the organization's data, not a log.

## Step by step: reading and replying

:::steps
### Open Messages

**Messages** in the menu (`/messages`) lists your conversations, with an unread count on each and
the day of its last message. **Load older** shows more.

### Open a conversation

Click its title. Messages read oldest first, with **Load older messages** at the top. A message
someone changed says "· edited"; a deleted one says "This message was deleted."

### Write

Type in **Write a message** and press **Send**, or **Enter**. **Shift + Enter** adds a new line.
:::

> [!WARNING]
> **The screens do not yet offer everything the server can do.** These work through the API but
> have no button in the app yet:
>
> - starting a conversation;
> - adding or removing people, renaming a channel, leaving one;
> - editing or deleting a message;
> - marking a conversation read, so its unread count does not go down by itself.
>
> Until they are added, a conversation has to be started through the API. With none yet,
> **Messages** says "No conversations yet. Start one to see it here."

## The rules

| Rule | Detail |
|---|---|
| Direct message | Exactly two people. Starting one again with the same person reopens the old one. You cannot message yourself |
| Channel | An optional name of up to 120 characters, and up to 100 people when it is made |
| Who can be added | Active members of the organization only |
| Message length | Up to 4,000 characters. No attachments |
| Changing your own message | Within 15 minutes of sending it |
| Changing anyone's message | Anyone holding `messaging.conversation.manage`, at any time, in conversations they are in |
| Sending fast | Up to 60 messages a minute each |

A deleted message keeps its place, with its words removed.

## Who can use it

| Action | Permission | Built-in roles |
|---|---|---|
| See and read conversations | `messaging.conversation.read` | Owner, Administrator, Member |
| Start a conversation | `messaging.conversation.create` | Owner, Administrator, Member |
| Send | `messaging.message.send` | Owner, Administrator, Member |
| Change or delete your own message | `messaging.message.update` | Owner, Administrator, Member |
| Add or remove people, rename, change anyone's message | `messaging.conversation.manage` | Owner, Administrator |

Guests have no messaging at all. And everyone can open only the conversations they are in, whatever
their role.

## Good to know

- **Losing access takes up to a minute.** An open conversation re-checks its reader every 60
  seconds. Deactivate someone, or take away their permission, and their open page stops receiving
  within a minute.
- A deactivated member stays listed in their conversations, but receives nothing more.
- Someone who reconnects after a short drop gets what they missed. After more than an hour away,
  the page simply reloads.
- A channel's creator cannot leave it: nobody can yet be made its owner instead.
- A direct message notifies the other person: see [Notifications](/docs/admin-guide/notifications).
  Channel messages do not.
