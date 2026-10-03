## What it is

The app sends email for sign-ups, invitations, password resets, email changes and daily digests.

## How it works

:::steps
### The app queues the email

Pressing **Invite**, for example, puts an email job on the queue.

### The worker sends it

The worker picks it up and sends it, at most 600 a minute so a burst never floods the mail server.
:::

> [!IMPORTANT]
> **Email is only sent while the worker runs.** If invitations are not arriving, check the worker
> first.

## On your machine: Mailpit

On a development machine, no email ever leaves. Every message lands in **Mailpit**, a fake inbox:

:::steps
### Open the inbox

Go to `http://localhost:28025`.

### Find the message

Every email the app sent is there, whoever it was addressed to.

### Click the link

Verification and invitation links work just as they would from a real inbox.
:::

## Good to know

- Mailpit keeps messages in memory, so stopping the services empties it.
- An error mentioning port `21025` means the Mailpit container is not running; start the services
  with `pnpm infra:up`.
- In production, the mail settings point at a real mail service instead.
