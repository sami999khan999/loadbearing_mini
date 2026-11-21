---
title: Visibility
description: Four independent reasons something is missing from a screen — a flag, an entitlement, a permission, a widget preference — the order they resolve in, and the one answer to "why is it gone".
---

# Visibility

> [!NOTE]
> **Lite kit.** Lite ships three of the four mechanisms — flag, entitlement, permission. Widget
> preferences and zones are not built, so everything below about widgets is the design to port, not
> code to look for. It returns from [`docs/scale/`](../scale/index.md); until then the dashboard is a
> static page.

A card missing from the dashboard may be unfinished, outside the org's plan, not granted by the
person's role, or hidden by somebody — four owners, four fixes. As one mechanism, "why is it gone"
has no answer without reading code. So there are four, and each only narrows the one above.

| Mechanism | Owner | Reach | Lifetime | What the API says |
|---|---|---|---|---|
| **Flag** | engineering | the deployment, or a list of orgs | temporary — deleted after rollout | `NOT_FOUND` |
| **Entitlement** | platform admin | one org | as long as the org exists | `FORBIDDEN` |
| **Permission** | org admin | a role, or one user | ongoing | `FORBIDDEN` |
| **Widget preference** | a user, or the org admin | one user, or the whole org | persists | nothing — it is cosmetic |

---

## The order, broadest cause first

A widget resolves **flag → permission → admin preference → user preference** and stops at the first
that hides it, reporting the most fundamental reason: a user who hid a card their role no longer
grants is told `denied`, since restoring it would change nothing. The answer is one
`WidgetVisibility`: `visible`, `hidden-by-flag`, `denied`, `hidden-by-admin`, `hidden-by-user`,
`unregistered` (a preference row naming a widget the code no longer declares — stale, not an error).

## Entitlement is a mask, not a step

It narrows the org's `CapabilitySet` on the server before anything asks, so `<Can>`, the nav,
`RouteGuard` and `Authorizer.assert` obey a plan without knowing plans exist. **Grants are filtered,
never deleted** — role rows are the org admin's data, so a downgrade masks them and an upgrade
restores their configuration instantly. Never masked: `core`-module keys (everyone holds them) and
`platform`-scope keys (no tenant plan reaches them).

## `NOT_FOUND` for a flag, `FORBIDDEN` for the rest

A flag that is off means the thing does not exist yet for this org; `FORBIDDEN` would announce a
feature nobody announced. **The error carries no flag key** — `ErrorInterceptor` sends
`error.toJSON()` to the browser. Client-gating flag names are in the bundle anyway: **a flag is the
wrong tool for a secret**; it controls when something ships, not who may know it exists.

**A doc linked to a feature adds no mechanism.** A page or space linked to a module, permission,
flag or plan resolves through the flag, entitlement mask and permission; every link must pass, and a
failed doc is `NOT_FOUND` (the docs' "not yours is not found"). See
`packages/application/docs/reference/doc.md`.

---

## The rules for a widget

Six from the original design, four added here.

1. **A widget is the smallest unit with an independent reason to be absent.** A card, not the button
   in it — the button cannot be missing for any reason the card is not.
2. **`policy` defaults to `required`.** Dismissible is a decision; a card that can vanish by default
   is a support ticket.
3. **The permission lives in the registry, never in props.** Only `goalId` comes from the call site;
   a prop permission is one each call site can get wrong, and the inspector could not read it.
4. **Registered is not resolved.** Declare every widget statically in a fragment; compute visibility
   per request. A registration depending on runtime state is invisible to every check.
5. **A preference is cosmetic** — a row, not an audit entry; it changes nothing anyone can do.
6. **Per-user denies are permanent; per-user grants expire.** A forgotten grant is unreviewed access,
   so it carries a reason and an expiry: 30 days default, 90 max.
7. **`<Can>` gates an affordance inside a visible unit; `<Widget>` gates a unit.** Neither wraps the
   other; a zone takes an `items` array, so `<Can>` as its direct child cannot be written.
8. **Inline widgets are required.** Preferences load with the route owning a zone, not the session,
   and an inline widget has no zone; making one dismissible would put a routed read on every request.
9. **Never lazy-load by permission.** The bundle is not secret, so it hides nothing and adds a
   waterfall to the allowed path. Route splitting is the router's job.
10. **Hiding is not revoking.** A hidden card's procedure answers, bookmarks open, the nav reaches
    the module. So the nav is `required` and never hideable — the last path to every capability.

## Names and related pages

The mount point is a **zone**, never a surface ([Vocabulary](vocabulary.md), with the flag, widget
and zone key grammars). The four places a permission is checked are
[enforcement surfaces](../../apps/web/docs/reference/enforcement-surfaces.md); `<Widget>` is a second
form of the fourth and, like `<Can>`, not the gate. Why a platform admin is a tenant owner only in
the platform organization: [platform scope](../../packages/permissions/docs/reference/platform-scope.md).

## Where these rules are enforced

| Rule | Enforced by |
|---|---|
| A zone's component map names exactly its zone's widgets | the type: `satisfies Record<ZoneWidgetKey<…>, …>` |
| Every inline widget is placed by a literal key | `check-architecture.mjs` §30 |
| No flag outlives its expiry, and none goes unread | `check-architecture.mjs` §31 |
| Every dismissible widget's module has a nav gate | a spec over `WidgetRegistry` and `GATES` |
| No `lazy()` in `feature` or `apps/web` | ESLint `no-restricted-syntax` |
| The permission is never a prop | the type: `<Widget>` has no `permission` prop |
| `<Can>` is never a zone's direct child | the type: `<Zone>` takes `items`, not children |
| Rules 1 and 4 | Review — judgements about a design no check can make |
