---
title: Membership enrolment
description: Why a session is refused to a user with no membership, the three modes that give them one, the invitation claim that runs before any of them, and why tenancy is a binding in the DI root rather than a policy baked into an adapter.
---

# Membership enrolment

`AuthFactory` refuses a session to a user who belongs to no organization:

```ts
const organizationId =
  (await memberships.activeOrganizationFor(userId)) ?? (await enroller.enrol(userId));

if (!organizationId) return false;
```

The tenancy gate: an account with no membership can never sign in, and no log says why. **Enrolment
stops the gate being a wall.**

## Why it runs from `session.create.before`

Not `user.create.after`, which Better Auth runs after the sign-up endpoint finishes — after the session
was refused. `activeOrganizationFor` answers every later session, so `enrol` runs once per user.

**Suspension is checked first** (`MembershipReader.isSuspended` throws `ACCOUNT_SUSPENDED`): a suspended
user's `activeOrganizationFor` is null, and `bootstrap`'s `enrol` would hand their tenant back. The
password was already correct, so naming the reason reveals no account's existence.

## Three modes, one decorator, one binding

`AUTH_ENROLMENT_MODE` picks a `MembershipEnroller`; `Container` is the only branch on it:

| Mode | Implementation | What an *uninvited* new user gets |
|---|---|---|
| `personal` *(default)* | `PgPersonalOrganizationEnroller` | An organization of their own, seeded with the four system roles, and `owner` in it |
| `bootstrap` | `PgBootstrapMembershipEnroller` | Membership of the one organization named by `BOOTSTRAP_ORGANIZATION_SLUG` — first in as `owner`, everyone after as `member` |
| `invite` | `NullMembershipEnroller` | Nothing. Their first sign-in is refused |

Every one of them is wrapped in `InvitationClaimingEnroller` before it is handed to `AuthFactory`:

```ts
enrol(userId) = (await claimer.claimPending(userId)) ?? inner.enrol(userId)
```

**An invited address joins its inviter and the mode is never consulted** — an invitee gets no personal
organization (swapping the two calls is the other model). Tenancy is what a starter kit is most often
forked over, hence a binding, not adapter policy: a fourth mode is a class and one `Container.enroller`
line.

- **`personal`** is the default, the only mode working on an empty database (no `db:seed` needed), and
  each new person gets their own tenant.
- **`bootstrap`** suits a demo or single-tenant install and is **wrong for anything internet-reachable** —
  sign-up hands out membership of your organization.
- **`invite`** is the production posture: an invitation is the only door, and a refused first sign-in is
  the system working.

## What a claim checks, and where

`InvitationClaimer` writes `invitations` into `memberships` via `claimPending(userId)` (the enrolment
hook, no token) and `claimByToken(userId, token)` (the accept endpoint), one query with a predicate never
to relax:

> The invitation's address equals the **verified** address on the user row.

`invitations.token_hash` holds the **digest**; the plaintext lives only in the mail and the URL, so a dump
grants nothing (`PgInvitationClaimer` hashes on the way in — a raw-token lookup silently finds nothing).
**The token only finds the row; the verified mailbox is the credential** — without the check anyone could
register as the invitee, so it lives in the claimer's query, not a forgettable caller.

**A failed invitation mail does not undo the invitation.** The enqueue happens after commit (a mail
about a rolled-back row links to nothing), so `InviteMemberUseCase` returns the record rather than a 5xx;
its `try`/`catch` exists because the plaintext token cannot ride a durable row, making the enqueue the one
non-atomic step. A crash between commit and enqueue is answered by a resend action (filed `C6.9`), not a
delivery table; once queued, BullMQ retries and `MailConsumer` emits `mail.delivery.failed` on the last
attempt. Re-inviting replaces the row with a new token.

**Invitations require email verification:** with `AUTH_REQUIRE_EMAIL_VERIFICATION=false` no claim matches
and invitees fall through to the mode — fail-closed, so a demo flag cannot become account takeover.

- **Only pending invitations exist** — claim and revoke delete the row; the audit log (`member.joined`,
  `member.invited`, `member.invitation.revoked`) holds history, so no status column.
- **`memberships_uq` is `(organization_id, user_id)`**, so a member's claim is `onConflictDoNothing` — the
  invitation is consumed, their role untouched.

## The lock, and what it is protecting

All three Postgres writers read-decide-write in one transaction behind `pg_advisory_xact_lock`, on
different keys:

- **Bootstrap locks the organization** — two sign-ups on an empty one would both become `owner`, the
  wildcard role.
- **Personal locks the user** (no organization yet) — else two tenants for one person, half their data
  unreachable.
- **The claimer locks the user on the same key**, so a claim and a personal enrolment serialise.

Both enrollers re-check membership *inside* the lock, so Better Auth's retries return the first choice.

## One founder, two callers

`PgOrganizationFounder.found()` creates a tenant (row, four system roles, `owner` membership,
`organization.created` audit) for exactly two callers: the personal enroller and "New organization".
Both must match a seeded tenant, so it calls `pnpm db:seed`'s `SystemRoleSeed`, resolving `owner`'s
wildcard via `PermissionRegistry.instance.all()` — a second copy would be a second permission model. Its
transaction opens on `this.db`, so inside the enroller's locked transaction it is a savepoint still
covered by the lock.

**The port carries an optional `slug`** (the enroller passes `u-<userId>`; absent, it derives from the new
id). Before, `Container` held the concrete founder to reach past a port that could not express it — a
bypassed port erodes the concrete-adapter ban. Reuse is also why the seed script is
`packages/infrastructure/seed.ts` above `src/`: as a folder barrel, importing `SystemRoleSeed` once
connected to Postgres and called `process.exit` mid-sign-in.

## Which organization a sign-in lands in

`activeOrganizationFor` prefers `users.last_active_organization_id` (written by switch) **while still a
member**, else the oldest membership — one query with a sort, so a stale preference never places a
session.

## Naming a tenant nobody named

A personal organization is named after its owner and slugged from their id; one created on demand is
named as typed and slugged from its own id:

```ts
slug: `u-${userId}`,            // personal
slug: `o-${organizationId}`,    // "New organization"
```

The name is the user's, so `infrastructure` writes no English. Slugs derive from ids, not names or
emails, which would need normalisation and collision handling — or `organizations_slug_uq` fails the
second Grace Hopper's sign-in. Nothing routes by slug yet.

## Related

- [`principal-builder.md`](./principal-builder.md) — what the resolved tenant is used for.
- [`capability-cache.md`](./capability-cache.md) — the cache keyed on `organization:user`.
