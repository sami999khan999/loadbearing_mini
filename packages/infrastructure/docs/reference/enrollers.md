---
title: Enrollers, the founder, and the claimer
description: The four Postgres adapters that put the first row in memberships — the advisory locks they take, the races those locks are protecting, and why every one of them binds structurally rather than by name.
---

# Enrollers, the founder, and the claimer

Four classes in `pg/repository/` write the artifact a session is refused without:

| Class | Port in `auth` | Mode |
|---|---|---|
| `PgPersonalOrganizationEnroller` | `MembershipEnroller` | `personal` — the default |
| `PgBootstrapMembershipEnroller` | `MembershipEnroller` | `bootstrap` |
| `PgInvitationClaimer` | `InvitationClaimer` | wraps all three |
| `PgOrganizationFounder` | `OrganizationFounder` | used by `personal` and by the create endpoint |

Each satisfies its port **structurally**: `auth` depends on this package, so neither can import the
other, and `Container`'s constructor lines catch signature drift. `AUTH_ENROLMENT_MODE` picks the mode; see
[`auth/docs/reference/enrolment.md`](../../../auth/docs/reference/enrolment.md) and
[`composition/docs/reference/container.md`](../../../composition/docs/reference/container.md).

## One advisory-lock namespace, three keys

`pg_advisory_xact_lock(namespace, key)`: all three use **one fixed namespace**, so these locks never
collide with others and a claim and enrolment for one user serialise. The key is a uuid's first eight hex
digits; a collision just serialises two enrolments.

| Class | Locked on | The race it is protecting against |
|---|---|---|
| `PgBootstrapMembershipEnroller` | the **organization** | Two sign-ups on an empty one both become `owner`, the wildcard role |
| `PgPersonalOrganizationEnroller` | the **user** | Two organizations and two owner memberships for one new person |
| `PgInvitationClaimer` | the **user** | A membership *and* a personal organization for one new person |

Read-decide-write runs in one transaction behind the lock, with the idempotency check **inside** it, so a
retry returns the first attempt's organization.

> [!IMPORTANT]
> **The check is scoped to the target organization, not just the user** — unscoped, bootstrap handed back
> whichever tenant the user had. Personal is keyed on the user alone, correctly: no organization exists
> yet to scope by.

## `personal`, and why the slug comes from an id

The default, and the only mode working on an empty database — multi-tenant on day one. The enroller owns
the lock and the "already has one" decision; `PgOrganizationFounder` makes the tenant, sharing the
repository's `TransactionScope` (else its savepoint opens on the pool, outside the lock). Named after the
person (no English here); **slug from the id**, since user input needs normalisation and collision
handling and nothing routes by slug.

## `bootstrap`, and what it is not for

Every sign-up joins one named organization — first as `owner`, then `member`. For demos, single-tenant
installs and local work against `db:seed`; **wrong for anything internet-reachable**. An undefined slug
(the default) enrols nobody, so the session is refused. Both roles come from `SystemRoleSeed`; if either
is missing **enrolment declines rather than guesses** — inventing a role invents a permission set.

It takes the slug in its constructor; a former fluent `withOrganizationSlug` setter left a window where it
silently enrolled nobody.

## `PgOrganizationFounder`: one implementation, two callers

Callers: the personal enroller and the "New organization" endpoint. Both must match a seeded tenant, so
`SystemRoleSeed` is reused, resolving `owner`'s wildcard via `PermissionRegistry.instance.all()`.

```ts
return this.db.transaction(async (tx) => { … });
```

`this.db`, not `this.database.client`: inside the enroller's transaction it is a **savepoint**, standalone
its own transaction — seed and audit land with the organization either way. A missing `owner` role throws
and rolls the tenant back. The audit row is written as the new tenant with an empty capability set (the
logger reads only organization and actor). `OrganizationFounder` is restated here as an interface (the
port lives downstream in `auth`), and the personal enroller takes that shape so `Container` stays the one
place a class is named.

### Warm spares: the founder claims a tenant that already has its partitions

Since `PF.3` a signup pays no partition DDL. The worker's `spares` job (every five minutes) tops
`spare_tenants` up to twenty — tenant ids whose seventeen partitions exist on node 0 but whose
`organizations` row does not, each made in one transaction so a crash leaves no unnamed partitions.
`found` claims the oldest with `delete … for update skip locked limit 1 returning id` in its own
transaction:

- **A failed signup gives the spare back** (the delete rolls back).
- **A busy pool is an empty pool** — `SKIP LOCKED` falls through rather than queueing.
- **An empty pool seeds inline**; the pool changes speed, never success.
- **`TenantPartitionSeed.run` still runs** (a month-old spare may be a runway month short); otherwise one read.

Measured 2026-09-24, ten foundings each way on a small node: median **126 ms inline vs 21 ms on a spare**.
Inline grows with the node (a tenant attach checks every sibling's bound: 377 ms DDL at 2 000 tenants,
`partitions.md`); spares do not. Node 0 only — the founder places every tenant there and it hosts the
catalog, so one transaction holds claim and partitions. The nightly orphan count and test sweeps treat
spares as live.

## `PgInvitationClaimer`: the verified address is the credential

Deliberately **not** tenant-scoped — the caller holds a token or user id, and the tenant is the *answer*
(as with `activeOrganizationFor`). One predicate scopes it, never to relax:

> the invited address equals the user's **verified** address.

The mailbox is the credential, the token a lookup key; with `AUTH_REQUIRE_EMAIL_VERIFICATION=false`
**invitations fail closed**. Expiry compares database time. The insert is idempotent under
`memberships_uq (organization_id, user_id)` — an existing member keeps their role; the invitation is
consumed either way.

## A lock-out is never handed back

A deactivated membership is an admin's lock that re-invitation does not lift (that is
`member.deactivate`'s call), so none of the three returns such a tenant — the hook asks only after
`activeOrganizationFor` found nothing active, and a session pinned there is refused anyway.

- **Personal** returns an active membership if there is one, and `null` once every membership is
  deactivated, rather than founding a second organization.
- **Bootstrap** returns `null` when the user's membership of the configured tenant is deactivated.
- **The claimer** skips an invitation to a tenant that deactivated the user, and leaves it pending.
  It also refuses a suspended user (the accept endpoint needs only a session).

**The address predicate compares the bare column, never `lower()`.** `InviteMemberUseCase` lowercases on
the way in (so `invitations_email_uq (organization_id, email)` works); `lower()` at read time would defeat
`invitations_email_idx` and seq-scan every pending invitation per sign-up. `InvitationPreview` is restated
here for the dependency-direction reason.

## `organizationsFor` is capped at 100

The switcher renders every row of a three-table join, so it is bounded by a named constant (a product
decision). **Past 100 the answer is search** — a filter box and paged query with its own index — not a
bigger constant. Truncation is silent: no caller of a list can act on "there were more".

## The uuid cast

`memberships`' organization FK is a plain `uuid` (the brand is on `organizations.id`), so each class
casts there, as `PgMembershipReader` does.
