---
title: The mail pipeline
description: Why every message is a queue job, why auth mail goes through it too, why there is no delivery table, and where the delivery record actually lives.
---

# The mail pipeline

One path for every message: a caller publishes a *mail request* (template key, typed params, recipient,
locale) onto `QueueName.MAIL`; the worker renders text and HTML and hands it to `EmailSender`.

```
caller → MailPublisher → BullMQ (QueueName.MAIL) → MailConsumer → SendMailUseCase
                                                                   ├─ MailTemplates  (validate)
                                                                   ├─ MailRenderer   (compose)
                                                                   └─ EmailSender    (transport)
```

(Mail once left from two places — Better Auth's hooks inline, and `InviteMemberUseCase` swallowing
failures — with no record and no retry.)

## Auth mail goes through the queue too, and that costs something

Sending verification and reset inline was rejected. **Cost: in development mail arrives only while the
worker runs** (`pnpm dev` starts both; `.env.example` says so). **Gain:** one set of retries, backoff,
duplicate suppression and rate limit — an inline send learns of an outage from users. Auth mail instead
publishes at `high` (priority 1, ten attempts ≈ forty minutes from five seconds doubling; `normal`'s eight
≈ ten), so a short outage delays rather than loses. Exhausted jobs stay failed a week for
`pnpm queue:replay mail`.

- **Credential mail is kept an hour, not a week** (`RW.2`): verification, reset and email-change links,
  2FA codes and invitation links are live in `params`, so those mailers set `credential: true` — removed
  on completion; a failure stays at least an hour (BullMQ trims by age only when a job finishes), long
  enough to replay; after that a fresh request gets a fresh token.
- **Batches are one enqueue** — `MailPublisher.publishMany` uses one `addBulk`, each job keeping its
  priority, attempts and dedupe key.
- **A `dedupeKey` holds a day** (`onceWithin`, a TTL key), not the job's lifetime — as a job id, BullMQ's
  thousand-job cap let a retried digest re-send earlier pages (`RV.5`). A day covers every automatic
  re-send (digest keys name their day; outbox gives up after ~three hours); only a deliberate
  `queue:replay` of an older failure passes it.

## There is no delivery table, and that is a decision

A pre-queue `mail_deliveries` table with `status` and `attempts` was removed:

1. **BullMQ already does it** — a `status` column is a second state machine that can disagree.
2. **The provider owns delivery truth** — bounces, complaints, suppression; a local table records only
   attempts.
3. **It would put the plaintext invitation token in Postgres**, which `token_hash` exists to prevent.

A mail log is added for a stated reason — regulated retention, an in-app resend history, a provider log
that expires too soon — not by default (`C6.10`).

**The outbox is the deliberate exception:** Redis cannot commit with Postgres, so an event must be
written in the transaction. A mail request is read back by nothing.

## So where is the delivery record?

Three log lines, and they are the answer to "was it sent":

| Event | Level | Emitted by | Carries |
|---|---|---|---|
| `mail.delivery.queued` | debug | `QueuedMailPublisher` | template, priority |
| `mail.delivery.sent` | info | `MailConsumer` | template, the transport's message id |
| `mail.delivery.failed` | error | `MailConsumer`, final attempt only | template, attempts |

`email.send.failed` carries the transport's reason, which `UnavailableError("smtp")` does not.

**None of the three carries a recipient.** An address is the highest-cardinality field this system
holds, and a log platform is not where it belongs — `event` is the field a log store indexes as a
label, and the catalog is its cardinality budget.

The message id is what a provider webhook would correlate — why `EmailSender.send` returns a receipt and
`SendMailUseCase` hands it up for the worker to log (`application` never logs).

## Why the invitation send still sits after the commit

`InviteMemberUseCase` publishes after `unitOfWork.run`, in a `try`/`catch`: after, since a rolled-back
row's mail links nowhere; caught, since the plaintext token cannot ride a durable row, making this the
one non-atomic step. A crash between leaves an unmailed invitation — answered by a resend action (`C6.9`);
today, invite again.

## Where each piece lives

| Piece | Where | Why there |
|---|---|---|
| `MailTemplates` (key → params) | `contracts` | `application` has no zod; `contracts` may not import `content` |
| `MailPublisher`, `MailRenderer` | `application/src/port/` | the domain names the seam, not the transport |
| `SendMailUseCase` | `application/src/mail/` | validate, render, send — the only decisions |
| `MailLayout`, `ContentMailRenderer` | `composition/src/mail/` | the one layer that sees both copy and transport |
| `QueuedMailPublisher`, the two mailers | `composition/src/mail/` | adapters, named only in the DI root |
| `MailConsumer` | `apps/worker/src/consumer/` | thin, like an oRPC router |

The locale rides the request — `AuthMailer` takes a `MailRecipient`, since Better Auth's hooks run from
request-less token endpoints. It is `users.locale`, normalised by `AuthFactory`.

## Templates are hand-written HTML, and there is no template package

Templates are strings, so no React template package. `MailLayout` builds a table with inline styles —
the one place allowed literal colours, since `var(--primary)` renders nothing in an inbox
([color](../../../../docs/ai/rules/color.md)). Plain text is composed from the same content, not stripped
from HTML (which leaks `&amp;` and breaks query strings).

## The swap this is shaped for

SMTP → SES, Postmark or Resend is one `EmailSender` adapter, buying bounce and complaint webhooks,
suppression and a searchable sent log (`C6.11`) — Tier 0 (protocol) to Tier 2 (SDK behind a port).
