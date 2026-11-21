---
title: Router
description: The authed chain's order, why a stream is wrapped once for the shard scope and once for errors, and why every stream lives under one namespace.
---

# The router half

## `authed`, in order

`implement(contract)` with five middlewares, in a designed order — a router on `authed` cannot skip one:

1. **Correlation**, so even principal failures are correlated.
2. **Errors**, so every later failure is logged once as the wire envelope, with `traceId` and scoped logger.
3. **Principal**, failing **closed** on an unmapped procedure.
4. **Rate limit**, counted per principal.
5. **Shard**, keyed off the principal.

## The rate limit names its procedures

Until `CR.6` only the stream cap limited this surface: invitations could mail any address from the
product's domain at script speed, `document.*` calls are paid embeddings, and `docPage` calls render or
sign uploads. Better Auth limits only `/api/auth/*`. `RateLimitPolicy` lists the procedures that cost something:

| Procedure | Limit |
|---|---|
| `member.invite`, `member.resendInvitation` | 30 an hour |
| `document.search`, `message.send` | 60 a minute |
| `document.index`, `conversation.create`, `docPage.publish` | 30 a minute |
| `docPage.preview`, `docPage.search` | 120 a minute |
| `docPage.upload` | 60 an hour |
| `assistant.send` | 20 a minute |

Counted per principal and procedure (`rate:<procedure>:<organization>:<user>`), a fixed window in the
**cache** Redis — `SET NX EX` then `INCR` in one `MULTI`; past it, retryable `RATE_LIMITED` (429). **No
default for other paths** — a Redis round trip per request to protect nothing. A spec asserts every name is
a real procedure (a renamed path limits nothing). **It fails open** — an unreachable counter must not
refuse every invitation.

## A stream is wrapped twice

A streaming body runs after `next()` resolves, so two unary freebies are carried per frame:

- **The shard scope** — `shardMiddleware` snapshots its `AsyncLocalStorage` and runs every `next`,
  `return` and `throw` through it, else later frames have no key and no pool.
- **The error envelope** — `errorMiddleware` wraps the same three, so mid-stream throws reach
  `ErrorInterceptor`.

## One namespace is one process

The stream is under `realtime`: `realtime.stream`, for the user's channel. So the client routes every
`realtime.*` path to the stream process by first segment, with no list to keep in step.

## A stream asks again every minute

Authorized at open, a stream can be held thirty minutes; until `CR.4` a deactivated member kept its
frames. `StreamRevalidation.watch` asks every sixty seconds; a no aborts the signal, the stream ends
normally, the reopen is refused, and a non-retryable refusal stops the client.

`realtime.stream` asks `memberships.isActive(user, organization)`, which joins `users` on
`suspended_at`, so a platform suspend ends it too. **A throwing check keeps the stream** — only `false`
ends it, else a database blip reconnects every tab at once. A tick while a check is out is skipped; the
timer is `unref`'d and cleared in `finally`.
