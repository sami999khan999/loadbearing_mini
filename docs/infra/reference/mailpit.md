---
title: mailpit
description: The SMTP sink — every outbound mail is caught and displayed, none is delivered. One env var separates it from a real provider.
---

# `mailpit`

```yaml
mailpit:
  image: axllent/mailpit:latest
  ports:
    - "${SMTP_PORT:-21025}:1025"     # SMTP — what the worker dials
    - "${MAILPIT_UI_PORT:-28025}:8025" # web UI — what you read
  healthcheck:
    test: ["CMD", "/mailpit", "readyz"]
```

No config file or volume; the inbox is in memory, so `pnpm infra down` empties it — right for a
scratch mailbox.

## What it is for

`SmtpEmailSender` in `packages/infrastructure/src/smtp/` dials `SMTP_URL`, which is
`smtp://localhost:21025` locally. Mailpit accepts the message, **delivers it nowhere**, and shows it
at <http://localhost:28025>.

The transport is **pooled** (up to five connections, recycled every hundred messages) and bounded —
ten seconds to connect and greet, thirty of mid-send silence — so a hung server fails as `UNAVAILABLE`
for the queue to retry instead of holding the job for nodemailer's minutes. It connects on first send,
so a process that never mails opens no socket.

> [!IMPORTANT]
> **It cannot reach a real address — the feature.** A misaddressed dev digest lands in your inbox,
> not a customer's; that ends the day it is swapped for a real provider.

## Reading what was sent

```bash
open http://localhost:28025          # the UI — subject, recipients, HTML and text parts
curl -s localhost:28025/api/v1/messages | jq '.messages[0].Subject'
```

The API lets a test send, then assert on what arrived — no provider sandbox, no fake.

## The swap

One environment variable, no code change:

```
SMTP_URL=smtp://localhost:21025                    # mailpit
SMTP_URL=smtps://user:key@smtp.provider.com:465   # any real provider
```

`smtps://` for implicit TLS on 465, `smtp://` with STARTTLS on 587. The sender reads only the URL, so
the provider is a deployment decision ([Tier 0](../../opinions/dependencies.md)).

## The healthcheck is unusual, and deliberately so

No `wget` or `curl` in the image, so a `CMD curl -f …` probe fails `executable file not found` and
leaves a working container `unhealthy` forever. `/mailpit readyz` is the documented self-probe.

## What to check when it is wrong

| Symptom | Usually |
|---|---|
| Worker logs `ECONNREFUSED :21025` | Container not up — `pnpm infra up` |
| Worker logs `ECONNREFUSED :1025` | `SMTP_URL` points at the container port from the host — use `21025` |
| Mail sends, UI is empty | Two Mailpits — check nothing else owns 21025 |
| `unhealthy`, but mail arrives | The healthcheck was changed to `curl`; see above |
| Inbox empty after a restart | Working as designed — no volume, memory only |
