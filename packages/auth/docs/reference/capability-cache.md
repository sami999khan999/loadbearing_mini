---
title: CapabilityCache
description: Sixty seconds, and no longer — the TTL is a revocation window rather than a performance dial. Plus why the key carries the organization, and why it carries it in that position.
---

# `CapabilityCache`

`CapabilityRepository.resolveFor()` is four queries — role permissions, goal memberships, per-user
overrides, and the entitlement mask — on nearly every request. This class is the read-through in front
of it.

## The TTL is a revocation window

```ts
private static readonly TTL_SECONDS = 60;
```

**Sixty seconds is how long removed access may still work** — not a hit-rate dial; raising it trades
a security window for a metric. **Expiries land within the same window:** `explainFor` and
`entitlementFor` filter rows past `expires_at`, but nothing flushes at that instant, so a just-resolved
set can serve a lapsed grant for up to sixty seconds. The nightly sweep removes, audits and flushes —
housekeeping; the filter is the mechanism. `AUTH_COOKIE_CACHE_MAX_AGE_SECONDS` has the same ceiling,
capped at 60 in `env.ts` so raising it fails at boot.

**The TTL is the backstop, not the mechanism.** The mechanism is `invalidate()`, called on every RBAC
write:

| Change | Call |
|---|---|
| Role permissions edited | `invalidateOrganization(organizationId)` |
| Membership's role changed | `invalidate(organizationId, userId)` |
| Membership added or removed | `invalidate(organizationId, userId)` |
| Per-user override written | `invalidate(organizationId, userId)` |
| Membership deactivated or reactivated | `invalidate(organizationId, userId)` — `CR.2` |
| Any of the above **in the platform tier** | the same call, plus `invalidatePlatform()` |

The domain does not name this class: `CreateRoleUseCase` and siblings take a `CapabilityInvalidator`
port, bound by one `Container` line.

- **Flush after commit, never inside** — while the old row is still committed, a concurrent read
  resolves the stale set and puts it back.
- **And flush twice** (`CR.9`): a read-through whose query ran *before* commit and whose `SET` lands
  *after* the flush writes the revoked set back for the rest of the minute. Each invalidation repeats
  two seconds later (longer than one indexed query, far shorter than the TTL) on a timer that holds no
  process open and swallows its own failure. A generation counter would close the window exactly at a
  second Redis round trip per request.

A stale miss is a security bug in a caching bug's clothes; the TTL makes a forgotten call site cost a
minute, not a session.

## Which write flushes what

Every write that changes what someone may do calls exactly one of these, after its commit.

| Write | Call | Why that wide |
|---|---|---|
| A per-user override, a membership's role or active state | `invalidate(org, user)` | One person's set changed |
| A role's grants, a role deleted | `invalidateOrganization(org)` | Everyone holding the role changed, and they are not enumerated |
| An org moved to a plan, an adjustment added, cleared or expired | `invalidateOrganization(org)` | The org's mask changed |
| A plan edited or deleted | `invalidateAll()` | Every org on the plan changed, and they are not enumerated |
| A module switched off or on | `invalidateAll()` | The kill switch masks every org |
| Anything in the platform tier | the platform prefix too | Added by this class, never by a use-case |

`invalidateAll()` is one `deletePrefix` over `capability:user:`, repeated after two seconds, leaving
`capability:platform:` (no plan reaches it). It is rare and cheaper than enumerating a plan's orgs.
**No version stamp, on purpose:** keying entries on a plan or org version invalidates by construction
but costs a second Redis read per request, to make exact a write that happens a few times a month.

## The third axis has its own prefix, and the adapter decides when to flush it

`platformFor(userId)` caches under `capability:platform:<userId>`, with no organization — the answer
ignores the active tenant. Only this class knows whether a changed tenant *is* the tier, so both
invalidation methods read `PlatformReader.organizationId()` and on a match also flush the platform
prefix — one place instead of four use-cases, and a customer-tenant role edit provably cannot change a
platform grant. Flushing every user is cheap: the tier has a handful of members; others' entries are
empty sets.

## The key carries the organization, and its position matters

```ts
`${CapabilityCache.PREFIX}${organizationId}:${userId}`
//  capability:user:        <org>            <user>
```

**The organization must be in the key** — otherwise a two-org user gets whichever set was cached
first, a cross-tenant privilege bug with a one-minute fuse that never reproduces on a single-tenant dev
database. **And in that position:** `invalidateOrganization()` deletes the prefix
`capability:user:<org>:`; the org segment elsewhere would put entries out of reach or make the tenant
unnameable. Flushing beats enumerating everyone holding an edited role.

## `invalidateOrganization()` is a flush, not a scan

`RedisCacheStore.deletePrefix` is `SCAN` + `UNLINK`, with a trap: ioredis applies `keyPrefix` to key
arguments but **not** `SCAN` results, so passing them back double-prefixes, and `UNLINK` of a missing
key is no error — success reported, nothing deleted. The prefix is stripped first.

## Tested behaviours

`tests/principal/capability.cache.spec.ts` pins the layout directly, since layout *is* behaviour:
`capability:user:<org>:<user>`; one user in two tenants gets two answers and two repository calls;
`invalidateOrganization()` takes only the named tenant's entries; `invalidateAll()` takes every tenant's
and keeps the platform entry.
