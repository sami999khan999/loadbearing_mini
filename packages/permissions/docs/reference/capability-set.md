---
title: capability-set
description: CapabilitySet — deny-by-default permission resolution, the five rules, and why intersect() is the method an RBAC model gets quietly defeated through.
---

# `CapabilitySet`

Resolved capabilities for one principal — a user or an API key, same shape.

```ts
export class CapabilitySet {
  public static from(dto: CapabilitySetDto): CapabilitySet;   // filters unknown keys
  public static empty(): CapabilitySet;

  public can(permission: PermissionKey, goalId?: string): boolean;
  public canAll(permissions: readonly PermissionKey[], goalId?: string): boolean;
  public canAny(permissions: readonly PermissionKey[], goalId?: string): boolean;
  public canTenantWide(permission: PermissionKey): boolean;   // held in every goal at once
  public goalsWith(permission: PermissionKey, amongGoalIds: readonly string[]): readonly string[];
  public intersect(other: CapabilitySet): CapabilitySet;
  public toJSON(): CapabilitySetDto;
}
```

---

## The five resolution rules

1. **Deny by default.** Absence of a grant is a denial. There is no "allow unless denied" path —
   except the one named in rule 5, which is a closed module rather than a path.
2. **Explicit deny beats every grant**, including the wildcard. This is what makes a per-user
   override usable as a suspension mechanism without unpicking role assignments.
3. **A goal-scoped permission with no `goalId` is `false`.** Not an error, not a throw — `false`.
   Forgetting the scope fails closed.
4. **Wildcard is checked after denies.** A superuser explicitly denied one permission is denied it.
5. **Every `core.*` permission is held by any resolved principal**, checked in the same place the
   wildcard is — after denies, so rule 2 is still the rule nothing is above.

```ts
CapabilitySet.empty().can("rbac.role.read");   // false — rule 1

const caps = CapabilitySet.from({
  wildcard: true,
  org: { grants: [], denies: ["rbac.role.manage"] },
  goals: {},
});
caps.can("rbac.role.manage");                  // false — rules 2 and 4
caps.can("rbac.role.read");                    // true
```

A goal-level deny is checked before the org grant covering it, so a permission can be held org-wide
and denied in one goal.

### Why the `core` module is exempt

```ts
CapabilitySet.empty().can("core.activity.write");   // true — rule 5
```

`core.activity.write` describes acting at all — every principal reaching a use-case writes an audit
row — so the only answer is yes. Granted through roles it was gotten wrong: only `owner`'s wildcard
carried it, `IndexDocumentUseCase` asserted it and member use-cases did not, so audit depended on which
use-case you were in.

The exemption looks up `PermissionMeta.module`, never a string prefix (a `core.something` key in
another module is not exempt; a renamed `core` key stays exempt). Checked **after** denies, so an
operator can still suspend it, and `intersect()` needs no special case because the rule lives in
`can()`, not the DTO. Adding the keys in `PgCapabilityRepository.resolveFor` instead would put the rule
in the store, forcing the SSR payload and Redis cache to carry it too.

---

## `toJSON()` / `from()` is why one class serves four runtimes

The DTO is plain JSON: the server resolves a set, serialises it into the SSR payload, and the browser
rebuilds the identical class, so `<Can>` and the oRPC handler run the *same* `can()` — as do the
worker and desktop app.

```ts
const revived = CapabilitySet.from(JSON.parse(payload) as CapabilitySetDto);
```

> [!IMPORTANT]
> The round-trip test in `capability-set.spec.ts` protects the architecture: if it fails, server and
> browser disagree about permissions.

`as CapabilitySetDto` is required: `JSON.parse` returns `any`, which
`@typescript-eslint/no-unsafe-argument` (via `recommendedTypeChecked`) rejects.

---

## `goalsWith()` does more work than it looks

```ts
caps.goalsWith("task.update", candidateGoalIds); // readonly string[]
```

Escalation targeting *by permission, not role*, "a manager sees capacity only in their goals", and
per-recipient digest filtering are all this method. Written once on the class owning the data, it keeps
"no hardcoded role checks" true — instead of `WHERE role = 'manager'` drifting across three query
files.

### Why the candidate set is a parameter

The object knows only goals its DTO names, but a wildcard holder and an org-level grantee hold a
goal-scoped permission in goals never named there. Filtering its own `goals` keys answered `[]` for
both while `can()` said `true`, feeding an empty scope into `VectorStore.search()` (empty means
`isNull(goalId)` — org-wide chunks only): a superuser got no goal-scoped results and **no error**.
Filtering caller-supplied candidates through `can()` makes all four shapes right:

| Principal | Result |
| --- | --- |
| wildcard | every candidate |
| org-level grant of a goal-scoped permission | every candidate |
| per-goal grants | only the granted ones |
| per-goal deny | excluded, even under wildcard |

It mirrors `VectorStore.search()`, where `goalIds` is required so scope cannot be forgotten.
Duplicates collapse; order is the caller's.

---

## `canTenantWide()` is the question a role assignment asks

A role is never assigned inside one goal, so "may this actor hand out that role" means "does the actor
hold every key **in every goal at once**". `can()` without a goal is `false` for goal-scoped keys (rule
3), which would make such roles unassignable; `canTenantWide()` asks the org level — deny wins, then
wildcard and `core`, then an org grant. One-goal grants do not count; platform keys are asked as `can()`
asks. The one caller is `RoleRules.assertAssignableBy` — `CR.1`'s fix, after `admin` (holding
`member.invite`) could invite anyone onto `owner`.

---

## `intersect()` is a security boundary

An API key cannot exceed its issuer. Intersecting at creation is the obvious half; re-intersecting
**at resolution** is the one that matters — a revoked issuer permission narrows every key on the *next
request*, closing the commonest way RBAC is quietly defeated. The original listing was wrong four ways,
each now pinned by a test in `capability-set.spec.ts`:

### Denies union, grants intersect

```ts
// key: wildcard, no denies.  issuer: wildcard, denies rbac.role.manage.
key.intersect(issuer).can("rbac.role.manage");
// original: true  ← the key does what its issuer is explicitly refused
// correct:  false
```

Keeping only `this`'s denies lets `wildcard && wildcard` survive with no denies — more than one input
grants. A deny on either side must survive.

### Goal keys union

```ts
// key knows no goals.  issuer denies member.deactivate inside GOAL.
key.intersect(issuer).can("member.deactivate", GOAL);
// original: true  ← iterating this.dto.goals discards the goal entirely
// correct:  false
```

Iterating only `this`'s goals drops the other side's restrictions on goals `this` never saw.

### Org candidates are tested at org level

```ts
// member.read granted at org level, treated as goal-scoped.
caps.intersect(caps).can("member.read", GOAL);
// original: false  ← intersect is not even idempotent
// correct:  true
```

An org grant of a goal-scoped permission covers every goal, but `can(p)` without `goalId` is `false`
(rule 3), so filtering through `can()` drops it. `intersect` uses the private `allowsAtOrg()`, the
same org branch `can()` delegates to.

### Both sides' grants are candidates

```ts
// key: wildcard, lists nothing.  issuer: no wildcard, grants member.read.
key.intersect(issuer).can("member.read");
// original: false  ← the intersection is empty
// correct:  true
```

A wildcard set lists nothing, so filtering only `this`'s grants yields nothing. Realistic: an
ex-superuser's wildcard key must narrow to their current explicit grants — not to nothing, not stay
wildcard. Candidates are the union of both sides' grants, kept where both allow — a true, symmetric
intersection.

---

## `from()` is where the vocabulary boundary holds

A DTO arrives from the database, a Redis entry or an SSR payload, and only the first is pre-filtered
by `isKnown()`, so `from()` re-filters every set:

```ts
CapabilitySet.from({
  wildcard: false,
  org: { grants: ["member.read", "task.archive"], denies: [] },
  goals: {},
}).toJSON().org.grants;                      // ["member.read"] — the unknown key is gone
```

The **sanitised** DTO is stored (`toJSON()` returns it by reference, so keeping the original would
write dropped keys back to the cache). A goal key survives even with every permission dropped, since
`intersect()` unions goal keys. `intersect()` also builds through `from()` — a few keys of redundant
work for one entry point instead of a trusted back door.

---

## `ScopedSet` is internal on purpose

`grants` and `denies` are `ReadonlySet`s built once, so `can()` is two hash lookups. Unexported — the
DTO is the contract. Its `public constructor(` is required: Biome's explicit accessibility makes a bare
`constructor(` a lint error.

---

## See also

- [`@loadbearing/permissions`](../index.md)
- [PermissionRegistry](permission-registry.md) — where `scopeOf()` comes from
- [ModuleRegistry](module-registry.md) — the only other consumer of `can()` inside this package
