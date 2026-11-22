---
title: Notification recipients
description: Three ways to resolve an audience, the correlated EXISTS that keeps one of them a single statement, and why a list of ids from a routed table is two reads rather than one join.
---

# `PgNotificationRecipientReader`

Three questions: everyone in the tenant (`organizationMembers`), one subject (`user`), and a page of
ids the caller already has (`users`).

Each is **tenant-scoped and joined through `memberships`** — an unscoped list is a cross-tenant leak
with emails attached, and `memberships` (not `users`) stops notifying deactivated members.

## `organizationMembers` and the correlated `EXISTS`

`holding` narrows to members whose role grants a permission, via a correlated `EXISTS` on
`role_permissions` against the membership's `role_id` — **one statement**. A join multiplies rows (then a
`DISTINCT` over everything); a role-id query is a second round trip and an unbounded array. Keyset on
`user_id`: the digest pages a tenant, and `OFFSET` reads every skipped row.

## `users` is one statement for a page of ids

`users(organizationId, ids)` answers a page in one statement with the `deactivatedAt` filter — **one
query per page, not per recipient**. The reader is wholly **catalog**: ids on a routed table are read
there first and handed in — two statements, never a cross-placement join (§22; the exemption set exists
to be empty). The big kit's conversation audience is built this way
([messaging](../../../../docs/scale/messaging.md)).

## What this reader deliberately does not do

It does not drop the actor (`DeliverNotificationUseCase` knows who caused the event) or resolve copy;
an unknown locale falls back to `en`. See also [sharding](sharding.md) for what `routed` and `catalog` mean, and
[the notification policy](../../../application/docs/reference/notification-policy.md) for which
audience each event asks for.
