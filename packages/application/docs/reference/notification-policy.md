---
title: The notification policy
description: What an event means to a person — who hears about it, in which channel, and why the unread count is cached while the rows never are.
---

# The notification policy

`NotificationPolicy` is a frozen table, one row per notifying event — the only place "who gets told
what" is decided.

| Event | Kind | Recipients | In-app | Email |
|---|---|---|---|---|
| `member.invited` | — | **nobody** | off | off |
| `member.joined` | `member.joined` | members holding `member.invite` | immediate | digest |
| `member.role.changed` | `member.role.changed` | the member it happened to | immediate | immediate |

- **`member.invited` has a `none` row**, not no row — considered, nobody to tell: no inbox yet, and the
  invitation mail is the notification.
- **`member.joined` goes to those who can act**, not the organization — else a hundred rows per joiner
  ([Data and scale](../../../../docs/opinions/data-and-scale.md) §6).
- **`member.role.changed` emails immediately** — changed rights are undiscoverable by looking.

## Every audience costs one query

The audience a row names is resolved by `NotificationRecipientReader`. There are three: `none`,
`subject` and `organizationMembers`. Each one resolves in a single statement against the catalog
tables `users` and `memberships` — see
[the recipient reader](../../../infrastructure/docs/reference/notification-recipients.md).

An audience resolves once per event — one round trip per delivery; one query *per recipient* would be
unacceptable. An audience whose ids live on a routed table reads them there first, then resolves here:
two statements, never a join.

## The subscriber's `events` list *is* this table's keys

`NotificationSubscriber.events` is `NotificationPolicy.events()`, so a new row delivers with no second
edit (a spec asserts it).

## The dedupe key is `(organization_id, user_id, event_id, kind)`

At-least-once delivery, so a unique index (not read-then-write, which races) absorbs replays.
`saveMany` reports **actually new** rows and only those are mailed or framed — a replay is silent all the
way down. **The actor is never a recipient** (`member.joined` filters them) — self-notification is why
people mute.

## Why the count is cached and the rows are not

The bell is on **every page** — uncached, one query per navigation per user, the first to hurt at 100k
DAU. So `notification:unread:<org>:<user>` is read-through with a 60 s TTL, **Postgres the truth**, and
every write for that user (mark one, mark all, a delivery) deletes it — a stale badge reads as broken.
**Capped at 100 in SQL** ("99+"), with the `LIMIT` inside the subquery so Postgres stops counting. Rows
are never cached: per-user, keyset-paged, and stale ones lie.

## Preferences resolve, they do not merely load

`GetNotificationPreferencesUseCase` returns the full category × channel grid, defaulting from the policy
(absent means "never changed" — not an empty day-one form). `in_app` `off` silences the frame, not the
row, hence `in_app`, not `inbox`.

## What the recipient filter can and cannot see

`PgNotificationRecipientReader` filters by a correlated `EXISTS` on `role_permissions` — one statement,
deliberately **coarse**: a per-user deny may still be notified, a wasted notification, not a leak (frames
carry no data, rows only the actor's id). Per-recipient `CapabilitySet`s would be one statement per person.
