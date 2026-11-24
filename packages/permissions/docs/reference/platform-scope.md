---
title: The platform scope
description: A third axis above the tenant — the four leak paths it closes, why the tier is an organization run like any other, the guards that protect its admins, and why the first admin comes from a script rather than the API.
---

# `platform`, the third scope

`PermissionScope` is `"org" | "goal" | "platform"`. The first two are inside a tenant. The third is
above every tenant, and it is the only one a tenant owner cannot reach.

## The tier is an organization

`organizations.is_platform` marks it (a partial unique index allows one; `pnpm seed:dev` marks
`loadbearing`). Platform permissions are held like every other — **through a membership and a role** —
resolved once per user and merged into every principal they get in any tenant, so a platform admin in a
customer tenant is still a platform admin. Why not an env list of admin emails:

- Removing someone's platform rights is deactivating a membership, which the existing members
  screen already does and the existing audit trail already records.
- A per-user deny works unchanged: `permission_overrides` in the tier, `effect = 'deny'`.
- A second platform role — read-only, say — is a role, not a code change.
- Nothing has to redeploy to change who is an admin.

## It is run like any other organization

`platform_admin` holds **every catalog key**, platform and tenant, including future ones — so in the
platform organization its admin does what any owner does: invites, builds roles, assigns them, writes and
publishes the platform's docs. Tenant keys act only while that organization is active (they come from the
active membership's role), so **a platform admin is a tenant owner nowhere else**. Custom roles there may
mix both kinds ("Support": `platform.account.read` + `member.read`; "Docs editor": `doc.page.write` +
`doc.page.publish`). `PlatformNav` shows each platform page to its key's holders, from
`PLATFORM_ROUTE_PERMISSION`, plus team, roles and docs while the platform organization is active.

The guards that keep the tier runnable:

| Rule | Where |
|---|---|
| Changing, deactivating or reactivating a member needs every key of their **current** role | `ChangeMemberRoleUseCase`, `SetMemberActiveUseCase` |
| The last active `platform_admin` cannot be demoted or deactivated, even while owners remain | `MemberRules.lastHolderGuard` |
| A platform key can be granted only on a role in the platform organization | `GrantPermissionUseCase`, rule `platformOnly` |
| A key you do not hold cannot be revoked from a role, unless the plan no longer includes it | `RevokePermissionUseCase` |
| The platform organization cannot be moved to a plan or adjusted | `AssignPlanUseCase`, `AdjustEntitlementUseCase` |
| Making a doc space public or granted needs `platform.doc.grant` | `DocRules.assertMayOpen` |

## The four leak paths, and what closes each

A third scope on a two-scope `can()` leaks four ways, each a `capability-set.spec.ts` case that fails
without this branch:

```ts
if (scope === "platform") {
  if (this.platformSet.deniesPermission(permission)) return false;
  return this.platformSet.grantsPermission(permission);
}
```

1. **A tenant's `wildcard`.** Production never sets it (`PgCapabilityRepository` and the API-key
   resolver write `false`; `owner` holds explicit rows), but it is on the DTO, and falling through to
   `allowsAtOrg` would make its holder a platform admin everywhere. **Platform admins never get it
   either** — it would make them owners in every customer tenant.
2. **An org-level grant of the same key** — the branch reads only `platformSet`, so a `platform.*`
   string in `org.grants` grants nothing.
3. **`intersect()`** sets `platform` to **empty**: a key acting as a platform admin could not be revoked
   by removing a membership.
4. **The `core` exception** is not consulted — a platform key in a core module would otherwise be held
   by every principal.

Also from this branch: **`owner: "all"` stops at the tenant** (`SystemRoleSeed` resolves it as the
catalog minus platform scope, and `reconcile()` takes back platform keys earlier deploys gave out); and
**the role editor shows no platform checkbox** in a customer tenant (`PermissionMatrix` takes
`excludeScopes`, by scope, never module name), while the grant use-case refuses with `platformOnly`
whoever asks. In the platform organization the grid reads platform keys from the platform axis.

## The DTO's third axis is optional, on purpose

`CapabilitySetDto.platform` is `ScopedSetDto | undefined`, read as empty when missing — a DTO cached or
serialised before the axis existed degrades safely to "no platform rights", where a required field would
throw on every request until the cache expired.

## The first admin comes from a script

`GrantPermissionUseCase` refuses keys the granter lacks — right, and it means **nobody can grant the
first `platform.*` key through the API**.

```bash
pnpm ops platform-grant alice@example.test
```

It creates one platform membership under `platform_admin` (moving an existing member onto it, losing
nothing). Later admins are invited from **Members** with the platform organization active, or given the
role via **Change role**.

## A suspended account, and the way back

`users.suspended_at` locks an account in every tenant at once (`/platform/accounts`,
`platform.account.manage`); a suspended platform admin holds nothing, tier included. Guards: no suspend
or platform deny may take `platform.account.manage` from its last live holder, and nobody may suspend
themselves. For what they miss — two admins suspending each other in one second — `ops platform-grant`
refuses a suspended account and prints the way back:

```bash
pnpm ops platform-grant alice@example.test
# alice@example.test is suspended by the platform (since …).
# Reinstate them at /platform/accounts. With no platform admin left to do that, by hand:
#   UPDATE users SET suspended_at = NULL WHERE email = 'alice@example.test';
```

A manual reinstate writes no audit row; the script will not do it, so the one unaudited change is typed
on purpose.

## Where the axis is resolved, cached and flushed

`PgCapabilityRepository.resolvePlatformFor(userId)` is two queries against the `is_platform`
organization, filtered to platform-scoped keys; `CapabilityCache.platformFor` caches it as
`capability:platform:<userId>` for sixty seconds (its own prefix, keyed on the user alone). Flushing is
the adapter's job: `invalidate` and `invalidateOrganization` also flush that prefix **when given the
tier**, so a customer-tenant role edit cannot change a platform grant and a tier edit always does.
`PrincipalBuilder.fromHeaders` reads both sets in parallel and merges them, as `session.fn.ts` does, so
client `can()` and server `assert()` agree; the API-key path and system principals carry an empty
platform axis.

## Adding a platform key

1. A line in `catalog/platform.permissions.ts`, `scope: "platform"`, `module: "platform"`.
2. `PlatformRoleSeed` grants it to `platform_admin` on the next `pnpm seed:dev` (resolving the whole
   catalog, and stripping platform keys from other organizations' roles).
3. An entry in `PLATFORM_ROUTE_PERMISSION` if the key opens a new platform page, so its guard
   and the platform menu agree.
4. Its procedure, its `catalog/platform.permissions.ts` entry in `contracts`, and its router
   handler, in one commit.

Until step 4 the key sits in `PERMISSION_AWAITING_A_PROCEDURE`
([`check-architecture.mjs`](../../../../tooling/scripts/check-architecture.mjs) §28) — an unasserted key
grants nothing, and the list only shrinks (empty since `24.2`).
