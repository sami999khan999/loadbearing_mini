---
title: Subscribers
description: The contract every outbox subscriber keeps — idempotent on the event id, no ordering, never logs — and why they live in application rather than beside the consumer.
---

# Subscribers

A durable reaction to a fact that happened. `OutboxConsumer` resolves one by name and calls
`handle(event)`; the rest is this contract.

| Subscriber | Listens for | Does |
|---|---|---|
| `member-realtime` | `member.invited` · `member.joined` · `member.role.changed` | publishes a compact frame on the actor's and the subject's user channels |
| `doc-index` | `doc.page.published` · `doc.page.deleted` · `doc.space.deleted` | queues a published page into the semantic index as one `doc` document naming its space, and forgets every page a delete removed (`DC.2`) |
| `notification` | whatever `NotificationPolicy` has a row for — today the same three | writes one inbox row per recipient the policy names, and queues a mail for those whose preference says so |

## The contract

- **Idempotent on `event.id`.** Delivery is at-least-once, so a duplicate must be a no-op in effect.
  `member-realtime` is idempotent by construction (a repeated frame costs a refetch). `notification` buys
  it from the database — the `(organization_id, user_id, event_id, kind)` unique index with a
  conflict-discarding upsert, not a read-then-write check two concurrent handlers would both pass. The
  first subscriber that can do neither triggers a `processed_event` inbox table.
- **No ordering** — events may be handled out of order; a subscriber needing sequence needs state.
- **It may and should throw** — a rejection retries that delivery alone, the reason one event becomes
  one job per subscriber.
- **It never logs** — it lives in `packages/application` (CI assertion §2); failures surface as the
  consumer's `outbox.delivery.failed`, naming subscriber and event.
- **It gets the event, never an actor** — a needed principal is built from `event.organizationId`; the
  request-time permission set may have changed, and the work is not on that person's behalf.

## Where they live, and why it is not here

In `packages/application`, **in the slice they serve**, filed by subject not mechanism —
`notification`'s policy table is read by three use-cases, only one reached from a job. They run **only
in the worker** (`SubscriberRegistry` is consulted only by `OutboxConsumer`), making the in-process
dispatch [Data and scale](../../../../docs/opinions/data-and-scale.md) §7 warns about structurally
impossible.

## The registry fails at construction, on purpose

It rejects a duplicate name or an undeclared event **at construction** — a startup crash, not a lost
event at 3am. The name is half of every job id, so two sharing one would dedupe and one would never run.
