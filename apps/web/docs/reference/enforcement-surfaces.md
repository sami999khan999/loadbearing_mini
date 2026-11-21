---
title: Enforcement surfaces
description: The four places a permission is checked, in order of authority — and why the three weaker ones are worth having even though only the first one is the gate.
---

# Enforcement surfaces

| # | Surface | Where | What it is |
|---|---|---|---|
| 1 | `Authorizer.assert()` | inside the use-case | **the gate** |
| 2 | `principalMiddleware` | the oRPC chain | defence in depth, failing closed |
| 3 | `RouteGuard` | a route's `beforeLoad` | stops the page rendering |
| 4 | `<Can>` | a component | a UX affordance |

**The rule:** removing a permission must hide the affordance **and** return `FORBIDDEN` — one alone is
theatre or erroring buttons. Only 1 is authoritative; the worker and adapter-skipping SSR bypass 2–4.
**The count does not grow with features** — a feature needing a fifth surface reaches data by a path none
of these sit on, which is the thing to notice.

## 1. `Authorizer.assert()`

The only one on every path —
[`application/docs/reference/authorizer.md`](../../../../packages/application/docs/reference/authorizer.md).

## 2. `principalMiddleware`

Fails **closed**: a procedure missing from `PROCEDURE_PERMISSIONS` is denied; with `contracts`' coverage
test, an unmapped procedure is caught at test time or here. `authed` is built from `implement(contract)`,
so `authed.role.list.handler(…)` is typed with no annotation; `implement(contract.role.list).use(authed)`
is not the same — `.use()` takes a middleware and fails with pages of inference. Anything on `base` is
unauthenticated on purpose and obvious in review.

### Why the error middleware is a middleware

`errorMiddleware` sits **inside** the chain — an adapter interceptor sees only the initial context, with
no `traceId` or scoped logger — and wraps `principalMiddleware`, so unauthenticated calls are logged like
any failure. It declares the context it *requires* (`BuilderWithMiddlewares` has no `.middleware()`), and
oRPC checks the chain supplies it. **`correlationMiddleware` runs first**, so even principal failures are
correlated ([correlation](../../../../packages/observability/docs/reference/correlation.md)).

## 3. `RouteGuard`

Stops the page rendering. It rebuilds the DTO and calls **the server's own `CapabilitySet.can()`** — a
second implementation is a second answer. `-guard.ts`'s hyphen keeps it out of the route tree.

- **`requireSession()` passes `location.href`** (path and search) as `redirect`, which `/sign-in`'s
  `RedirectSearch.schema` reads back — otherwise every deep link lands on `/`.
- **`RedirectSearch` rejects a backslash anywhere**: browsers resolve `/\evil.test` like `//evil.test`.
  One leading slash, no second separator of either kind.

## 4. `<Can>`

Not the gate. `<Can>` hides an affordance and names its permission at the call site. Hiding is a
courtesy: a hidden link typed by hand still answers `FORBIDDEN`.

## The DTO has three axes now, and the surface count did not grow

`CapabilitySetDto` carries `org`, `goals`, `platform`; all four surfaces share `can()`, so `platform.*`
needs no fifth. `PrincipalBuilder` merges tenant and platform sets, and **`session.fn.ts` runs the same
merge** (the only other place a set is built) — else 3 and 4 would hide pages the server serves. The
snapshot's `isPlatformOrganization` says whether the *active* tenant is the tier (not whether the user is
an admin); only the role editor reads it.

## No loading state grants access

The session store is seeded **signed out** and resolution only widens it, so a guard running before
`__root.tsx` resolves denies. There is no permissive "unresolved" state.
