---
title: Messaging
description: Direct-key uniqueness, unread computed rather than counted, the fast path beside the durable one, and where the send dedupe went when messages took a month level.
---

# Messaging

One slice, two contracts, and the decisions that are expensive to get wrong.

## A permission is necessary and never sufficient

`messaging.conversation.read` says a person may read conversations, not *which*. Every use-case also
calls `ConversationAccess`, so a third org member gets `FORBIDDEN` on `message.list`, not an empty
page. It is a shared object rather than a line copied into thirteen use-cases because a missed copy
would fail silently, in the direction that leaks. `FORBIDDEN`, not `NOT_FOUND`: the id came from this
tenant, so a different code tells a caller nothing new.

- **`assertParticipant`** is one join (the header where the caller has a member row), used by send,
  edit, delete, list, mark-read and typing. **`assertMember`** also loads the roster, used only by
  membership use-cases — loading every member to ask "is this person in the room" cost a 5,000-member
  channel 5,000 rows per send.
- **A conversation stream asks `WatchConversationUseCase`** (`assertParticipant` behind the read
  permission) on open and every minute after (`CR.4`), instead of `getConversation`, which loads the
  roster, unread count and every name.
- **The list carries a sample of members, not the roster** (`CR.26`). A row needs a name (an untitled
  channel is named after someone in it, a DM after the other person), and twenty 5,000-member channels
  was 100,000 rows. It now brings at most five per conversation, the reader always among them, read
  off `conversation_members_uq` with a per-conversation `limit`; a DM always comes back whole.
  `conversation.get` still returns the full roster, since that page names every author and typist.

## The direct key, and why the insert is `DO UPDATE`

A DM is unique per pair through `direct_key` = `<lowerId>_<higherId>` — sorted, so
`directKey(a, b) == directKey(b, a)`; unsorted, each person would get their own copy of the thread.
The index is **partial** (`WHERE direct_key IS NOT NULL`): NULLs are distinct, so a plain unique
index over the nullable column would constrain nothing. The insert is `ON CONFLICT … DO UPDATE …
RETURNING id`, not `DO NOTHING`, so two people opening the same DM in one second both get the one
row; `DO NOTHING` returns nothing to the loser, who would then race the commit.

## A member's name is a second statement, never a join

`conversation_members` is routed and `users` is catalog, and a repository reads one placement (a CI
assertion). `ConversationNaming` does the join in the use-case, after the routed read.

- **One statement per page:** ids are collected across the page, resolved once by
  `UserReader.namesOf`, attached **by key** — two queries for 25 conversations of 100 members, not 26.
  Never zipped by index: one missing row hands a member another's name.
- **Never inside a unit of work.** `CreateConversationUseCase` names the row *after* commit; a catalog
  read in a routed transaction is the crossing a shard split cannot honour, invisible on one node, so
  a spec asserts the ordering.
- **Its own port, not `NotificationRecipientReader`:** `Recipient` carries an email (a spread away from
  a member DTO); its `users()` filters deactivated memberships (right for recipients, wrong for a
  thread, where a departed author's messages would render a uuid); and `namesOf` returns names only.
- **A name is nullable and the fallback is copy.** Once `24.1` drops the catalog-crossing keys, a
  membership can outlive its user row; `null` renders `messaging.member.unknown`, never the id.

## Unread is computed, never counted

No `unread_count` column. `last_read_at` on the membership is the only state, and the count is a
`LATERAL` per row of the conversation page, **capped at a hundred**:

- **Nothing can drift** — a counter is a second source of truth, and the first missed decrement is
  permanent.
- **No fan-out write per message** — the alternative is an `UPDATE … WHERE user_id <> author` per
  send, the amplification `data-and-scale.md` §6 names.
- **`markRead` is idempotent** via `SET last_read_at = GREATEST(last_read_at, ?)`; a late mark cannot
  move the reader backwards.
- **The cap bounds the worst case** — a year-unopened channel costs a hundred index entries and shows
  "99+".
- **So does a floor:** only the last ninety days count, as a bound parameter the planner prunes by.
  Messages are not retired by default, so without it every list render read every month ever.

**A room's first page is bounded too:** `message.list` passes the conversation's `lastMessageAt` as
the page ceiling, and an empty room answers without a query. The 100k move is `unreadCounts` behind a
Redis `HINCRBY` adapter with `last_read_at` still the record — a one-method swap.

### `messages.created_at` is stored to the millisecond, on purpose

Postgres `now()` has microseconds; a JavaScript `Date` has milliseconds, so a value read back and sent
again is a *different* instant — and `findById`, `edit` and `softDelete` carry `createdAt` as a
predicate. All matched zero rows: edits and deletes did nothing, and a just-read conversation showed
one unread (`unreadCounts` compares `created_at > last_read_at`, which comes from the app clock). The
column is `timestamptz(3)`. `notifications` needs nothing similar: its `created_at` is the event's
`occurred_at`, already through a `Date`. **A timestamp used as a key must be storable in the type the
caller holds it in.**

## Two publish paths, and the client dedupes

`SendMessageUseCase` publishes the full frame on the conversation channel **right after commit** (fast
path); `MessagingRealtimeSubscriber` publishes it again from the outbox (durable path). The fast path
makes a message appear in milliseconds; the durable path makes it appear *at all* if the web process
dies between commit and publish. Both carry `messageId` and the client drops the second, so a duplicate
is free and a lost fast frame costs a second. Neither may be the only path.

**Typing** rides the conversation channel and stores nothing — a separate wire variant, not an
`event`, since it invalidates no cache and expires on its own. It is limited to one signal per two
seconds per conversation via a TTL'd cache entry ("published in the last two seconds?" is what a TTL
answers).

## The member frames go out in chunks

A message to N members is **one** publish of the body (on the conversation channel, deliberately) and
**N** compact "something changed" frames on members' own channels. Sent one at a time, each awaited,
25,000 members took **eighteen seconds**; in chunks of 500 through `Promise.all`, **769 ms** — ioredis
multiplexes one socket, so a chunk leaves as one write. Chunked, not one `Promise.all`, because a
100,000-member room is not a write buffer to build.
[infrastructure · fan-out](../../../infrastructure/docs/reference/fan-out.md) times both shapes side
by side. What remains at 25,000 is the notification rows — five seconds, where §6 said the cost would be.

## How `messages` is partitioned, and where the dedupe went

By tenant then month, like `activity_log` and `notifications`. The blocker was one index:

> A unique index on a partitioned table must include every partitioning column.

`messages_client_uq` on `(organization_id, conversation_id, client_id)` was the send dedupe. Adding
`created_at` would have **deleted** the guarantee: two attempts seconds apart carry different
timestamps. (`notifications` survives only because its `created_at` is the event's, recomputed
identically on redelivery; a send has no such value.)

**So the dedupe left Postgres.** `SendMessageUseCase` generates id and timestamp itself and claims the
client id with one `SET … EX … NX` before the transaction:

```
message:client:<organization>:<conversation>:<clientId>  →  { id, createdAt }, 24h
```

`false` means a retry: read the held pair, `findById` it, and return that row without touching the
conversation, outbox or fast path — attempts stay indistinguishable, as `DO UPDATE … RETURNING` made
them. `save()` is a plain insert; `client_id` stays as an unindexed column. **A claim whose row is
missing** (the first attempt rolled back) sends as new — the only answer that loses nothing — and the
succeeding attempt takes over the claim, so the next retry dedupes (a spec pins this).

Rejected alternatives: **a unique index per partition** created by `MaintenanceGateway` (correct, but
the generic loop would carry a per-table index spec) and **a non-partitioned side table** written in the
same transaction (an extra write on the hottest path). The cache key costs one Redis round trip, no
schema, and losing it means a duplicate, not a loss — which a chat client handles by message id.

Partitioning buys a manageable table and a detach-and-ship archive path, not a faster page: the keyset
cursor is a row constructor the pruner does not decompose, so a page still reads every tenant month
([partitions](../../../infrastructure/docs/reference/partitions.md)). Messages are domain data, so
`retentionMonths` is `null`.

## Old months may go to cold storage, and a conversation says so

D47 kept every message month in Postgres forever; `26.4` (2026-11-12) lets a platform admin set
`messages`' hot months on the retention screen, after which the nightly pass archives older months to
S3 like `activity_log`. Three rules keep anything written from being lost:

- **The three tables move as one** — `messages`, `message_reactions`, `message_attachments` form
  `PartitionedTable.MESSAGE_GROUP`; a save on `messages` writes all three rows, and a save or restore
  naming a sibling alone is refused (`rule: "group"`).
- **Archived, never dropped or expired** — `cold_mode` must be `archive` and `cold_months` null
  (`rule: "domainData"`).
- **A restore puts the month back where it can be read** — attached wherever it falls (other tables'
  out-of-window restores wait in a scratch table), with `partition_archive.held_until` blocking
  re-archive for thirty days.

The reader is told, not shown a gap. `MessageArchive` reads archived months from the catalog outside
any transaction, ignoring held ones; a conversation's oldest page carries `archivedThrough`, and the
list says "Messages up to that month are archived", naming a platform administrator as who can
restore. A thread whose root month is cold answers `rootArchived`, not `NOT_FOUND`. Only a platform
admin can restore.

## The notification policy stops at direct conversations

`message.sent` in a **direct** conversation becomes one `message.received` bell item; in a channel,
nothing — per-member notifications per message is §6's write amplification. The row declares a
**subject** (the conversation id), and `DeliverNotificationUseCase` drops recipients who already hold
an unread notification of that kind and subject, so a burst of ten messages is one item, one frame and
one digest line. The check is **one** indexed query for the whole audience — `unreadSubjectHolders`,
`user_id = any(…)` — against `notifications_subject_idx`, partial on
`read_at IS NULL AND subject_id IS NOT NULL`. It used to be one query per recipient: five hundred round
trips per channel message.
