---
title: Authorizer
description: Three lines that are the system's only real permission gate — why they live in the use-case, the position they occupy, and the timing leak that position accepts.
---

# `Authorizer`

```ts
export class Authorizer {
  public assert(principal: Principal, permission: PermissionKey, goalId?: string): void {
    if (!principal.can(permission, goalId)) {
      throw new ForbiddenError(permission, goalId);
    }
  }
}
```

The most important class in the package.

## Why it is not middleware

**The worker and SSR direct calls bypass transport middleware**, so an interceptor check protects only
HTTP. `assert()` is on every caller's path; the `api-server` middleware check stays as defence in depth
and a fast fail, not the gate.

## `assert` versus `can`

Mixing them is the bug this architecture exists to prevent:

| | Returns | Used by |
| --- | --- | --- |
| `capabilities.can(...)` | `boolean` | UI, to decide whether to render a control |
| `authorizer.assert(...)` | `void`, throws | use-cases, to enforce an outcome |

A UI check silently becoming the only check turns a hidden button into an open endpoint.

## Load, assert, work

```ts
public async execute(actor: Principal, input: ReactivateTaskInput): Promise<TaskEntity> {
  const task = await this.tasks.findByIdOrFail(input.taskId);

  this.authorizer.assert(actor, "task.reactivate", task.goalId);

  // ... the actual work
}
```

**The assertion is always line two or three**, so "is this gated?" is one line per file, not a call
graph. `assertAll` checks several and throws on the first missing, naming one permission.

## The leak this shape accepts

**Goal-scoped permissions load before asserting** (you need the `goalId`), so an unpermitted caller can
tell "absent" from "forbidden" by timing or failure shape. Usually acceptable. Where not, don't reorder —
have the repository take the principal and filter in the query, and say so in that port's comment, or
nobody can explain its empty results.

## It throws a code, never a status

`ForbiddenError` is `code = "FORBIDDEN"`, `context = { permission, goalId? }` — no prose, no `403`.
ESLint bans `HTTP_STATUS` under `packages/application/src`, which also lets the worker, with no HTTP, log
it meaningfully.

## A flag is checked first, and it answers `NOT_FOUND`

A use-case behind a feature flag asks two questions, in this order:

```ts
await this.flags.assertOn(actor, flag); // NOT_FOUND when off
this.authorizer.assert(actor, permission); // FORBIDDEN when not held
```

Lite declares no flags, so no use-case asks the first question yet. The rule is for the first
flag that lands.

**The flag goes first, the broader answer:** off means the feature does not exist for this org;
`FORBIDDEN` would announce it and send an admin to a role editor no role can fix. **The error names no
flag** — `NotFoundError("feature", "unavailable")` for all, since `toJSON()` reaches the browser
(`flag.cache.spec.ts` asserts the key is absent). `FlagCache` is a read (one deployment-wide key), hence
`await`ed beside the synchronous authorizer. **Invalidation is one delete**, not the capability cache's
two: a raced read restores old state for at most the 60 s TTL a flag already promises — a rollout
control, not a security boundary.

## `Principal.system()` is the other half

The worker needs an actor; a wildcard principal would make `Authorizer` a no-op for every job.

```ts
Principal.system(orgId, workerId, CapabilitySet.from({
  wildcard: false,
  org: { grants: ["task.read", "task.update"], denies: [] },
  goals: {},
}));
```

Exactly what the job needs — with everything, a schedule bug could do anything, faithfully audited as
the system.
