---
title: PrincipalBuilder
description: Four credential types collapse into one Principal here. Why the API key is checked before the cookie, why a rejected key never falls through to the session, and what the builder deliberately does not do.
---

# `PrincipalBuilder`

Twelve lines, each a decision.

```ts
public async fromHeaders(headers: RequestHeaders): Promise<Principal | null> {
  const apiKey = headers.get("x-api-key");
  if (apiKey) return this.apiKeys.resolve(apiKey);

  const session = await this.sessions.resolve(headers);
  if (!session) return null;

  const capabilities = await this.capabilities.forUser(session.organizationId, session.userId);
  return new Principal(session.organizationId, session.userId, capabilities, "user");
}
```

## The API key is checked first, and the order is a security property

A request with **both** a cookie and `x-api-key` is an integration in a browser context (an embedded
dashboard, a support script on a logged-in laptop, a webhook replayed from devtools). Session-first
would silently upgrade a `member.read` key to the user's full permissions. **The key is more specific,
so it wins**, and the session is never resolved.

## A rejected key does not fall through

`this.apiKeys.resolve(apiKey)` is `return`ed: a revoked, expired or unknown key is `null` and
unauthenticated, **never** falling through to the cookie — which would revive a revoked key for exactly
the caller who revoked it.

## `null` is a `Principal`-shaped answer, not an error

It throws nothing: `principalMiddleware` in `apps/web` turns `null` into `UnauthorizedError`, and the
worker never calls it (it builds a `SystemPrincipal` from a named grant list) — one builder for a 401
transport and an HTTP-less process. A suspended account is `null` with no branch here:
`MembershipReader.isActive` joins `users` and refuses once `suspended_at` is set, covering the builder,
`refresh` and API-key issuers.

## `refresh` re-reads a principal a stream is holding

A stream holds its principal for thirty minutes, blind to deactivations, role edits and revocations
meanwhile; `refresh(principal)` is its per-minute re-read.

| Kind | What `refresh` does |
|---|---|
| `user` | exactly what `fromHeaders` does after the session: `isActive`, then the tenant and platform sets, merged |
| `api_key` | `isActive` for the issuer, then the old set **intersected** with the issuer's current one |
| `system` | returns it unchanged — the worker never holds a stream |

**An API key only narrows** — its declared scopes are not in hand, and rebuilding from the issuer would
widen a `member.read` key to everything (the upgrade key-first prevents). A right restored to the issuer
returns only on reopen (a fresh `fromHeaders`).

## What it does not do

- **It does not authorize** — `Authorizer.assert()` in the use-case decides; a check here the worker
  would skip.
- **It does not know Better Auth** — it holds the `application` port `SessionResolver`, so NestJS rewrites
  a guard and a library swap rewrites only `BetterAuthSessionResolver`.
- **It reads no tenant from the request** — `ResolvedSession` carries the organization pinned at sign-in;
  no header, query or body field reaches `Principal.organizationId`.

## Tested behaviours

`tests/principal/principal.builder.spec.ts` pins both orderings (the file reads the same either way
round) and `refresh` — a deactivated user or issuer answers `null`, and a key never widens.
