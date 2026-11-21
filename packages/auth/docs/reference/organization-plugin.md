---
title: OrganizationPlugin
description: Switch, create, accept — the three actions that end in a session pointing at a different tenant, and why each is a Better Auth endpoint rather than an oRPC procedure.
---

# `OrganizationPlugin`

Three `POST` endpoints mounted on Better Auth:

| Path | Body | Authorization |
|---|---|---|
| `/organization/switch` | `{ organizationId }` | `MembershipReader.isActive` — one indexed lookup |
| `/organization/create` | `{ name }` | a session, the rate limit, and a cap on tenants owned |
| `/invitation/accept` | `{ token }` | `InvitationClaimer.claimByToken` decides |

Each ends in `rebind()`: the session row (and Redis copy) is rebound to the new tenant,
`users.last_active_organization_id` written, and **the cookie cache re-issued**.

## Why these are endpoints and not procedures

- **Only a handler holding Better Auth's `ctx` can call `setSessionCookie`.** Most requests resolve the
  tenant from the sixty-second `session.cookieCache` ([auth-factory](./auth-factory.md)); updating the
  row but not the cookie would answer for the old tenant for a minute.
- **They are identity-gated, not permission-gated** — membership and the verified mailbox answer them,
  never a role in another organization, so nothing in `PROCEDURE_PERMISSIONS` (where every procedure must
  be gated) could.

## `rebind()`, in order

```ts
const updated = await ctx.context.internalAdapter.updateSession(token, { activeOrganizationId });
await ctx.context.internalAdapter.updateUser(user.id, { lastActiveOrganizationId: organizationId });
await setSessionCookie(ctx, { session: updated, user });
```

Better Auth's own `setActiveOrganization`, plus the last-active preference. Row and Redis copy first,
cookie last, so the next request (RPC or SSR) sees the new tenant. `lastActiveOrganizationId` is where
the next sign-in lands; `activeOrganizationFor` honours it only while the membership exists, so removal
needs no undo.

## Refusals

- **`switchOrganization`** throws `FORBIDDEN`/`NOT_A_MEMBER` unless `isActive` — the whole
  authorization. It was `isMember` until `CR.7`, which let a session enter a tenant that had deactivated
  the person and then answer anonymously; sign-in's default and the switcher list skip deactivated
  memberships too.
- **`acceptInvitation`** throws `NOT_FOUND`/`INVITATION_NOT_CLAIMABLE` on a claimer `null`, covering
  every refusal (unknown, expired, revoked, other address, unverified) without distinguishing them to a
  token holder — the landing page already told the person which.
- **`createOrganization`** uses the personal enroller's `OrganizationFounder`, so its tenants are
  indistinguishable from first-sign-in ones ([enrolment](./enrolment.md)), and throws
  `FORBIDDEN`/`ORGANIZATION_LIMIT_REACHED` once the caller owns `AUTH_MAX_OWNED_ORGANIZATIONS` (default
  ten). **A rate limit bounds the rate, not the total:** five a minute is three hundred an hour, each
  seeding four roles and every permission, so an overnight script fills three tables without ever
  looking abusive. **Owning means holding `owner`**, not founding — `ownedCount` joins memberships to
  `roles` on `key = 'owner'` (surviving transfers) as a `count(*)`, since `organizationsFor()` caps at
  100 and would pass forever at the ceiling.

## Rate limits

Custom rules in `AuthFactory`, not the global twenty: create and accept at 5 (seeding a role set; a
guess against a token), switch at 20 — plus the ownership cap above. `NAME_MAX` is 80, refusing a pasted
paragraph.

## What is not used

Better Auth's own organization plugin: these tables point at this repository's `roles`, and the plugin
would add a parallel `member.role` string to reconcile. The one thing it uniquely does — rebind and
re-issue the cookie — is sixty lines here. The client half is `OrganizationClient` in
`packages/api-client`, three posts over Better Auth's `$fetch`; afterwards the call site does what
sign-out does (clear the cache, invalidate the session store, re-run the root loader).
