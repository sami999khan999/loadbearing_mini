---
title: entitlement-mask
description: EntitlementMask — what an org's plan allows, as a filter over role grants rather than a deletion of them, and the four rules for which key survives.
---

# `EntitlementMask`

Roles say what each person may do; the plan says what the org paid for. A shrinking plan leaves the
admin's roles intact so an upgrade restores them exactly — entitlement is a **mask** over grants before
`CapabilitySet.from`, deleting nothing.

```ts
const mask = EntitlementMask.from({
  plan: ["member.read", "member.invite"], // or "all"
  added: ["ai.embedding.read"],           // a trial is an expiring add
  removed: [],
  disabledModules: [],                    // the deployment-wide kill switch
});

CapabilitySet.from(mask.narrow(resolved.toJSON()));
```

## Which key survives

First match decides.

| # | Rule | Why |
|---|---|---|
| 1 | A `core`-module key or a `platform`-scope key is always entitled | Everyone holds a core key, and no tenant plan can reach a platform one |
| 2 | A key in a disabled module is not | The kill switch is for an incident, and nothing an org bought outranks it |
| 3 | A removed key is not | A removal is an explicit "not this org", so it beats the plan and an add |
| 4 | An added key is | An add widens the plan for one org, with an expiry for a trial |
| 5 | Otherwise, whatever the plan says | `"all"` answers yes to everything |

**`"all"` is resolved at the question, never listed** — `plan_permissions` rows would need reconciling
on every deploy that adds a key. The spec pins it with an undeclared key.

## What `narrow` touches

**Grants only**, at the org and in every goal. Everything else passes through:

- **Denies** — dropping one would *widen* access.
- **The platform axis** — no plan reaches it.
- **`wildcard`** — passes unmasked, one more reason production never sets it ([platform scope](platform-scope.md)).

## What it does not do

- **No database reads** — the capability repository resolves the four inputs in one statement.
- **No `requires` closure** — plans are stored closed both ways on write
  ([permission-registry](permission-registry.md#requires-and-its-mirror)).
