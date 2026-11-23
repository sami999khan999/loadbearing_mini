---
title: FlagRegistry
description: FlagRegistry — flags declared in code with an owner and an expiry, switched in Postgres, none declared in lite, and a client-gating set that is empty until widgets are ported back.
---

# `FlagRegistry`

A flag is a rollout — on for the deployment or some orgs while unfinished, then deleted. The failure is
the flag nobody deletes, a permanent unexplained `if`, so each is declared with the facts that make
deleting it someone's job:

```ts
export const taskFlags = {
  "task.bulk-edit": {
    owner: "sami",
    expiresOn: "2027-03-31",
    description: "Lets a member edit several tasks at once, …",
  },
} as const satisfies Record<string, FlagMeta>;
```

That fragment is an example. Lite declares no flags: `FLAGS` in `src/flag/index.ts` is `{}`, and a
fragment is spread into it when a rollout needs one.

Whether it is **on** lives in Postgres (deployment or per org); a missing row means off.

## The key

`<slice>.<change>`, where the change is a kebab noun: `task.bulk-edit`. — what changes, not what it guards.

## Client-gating is empty in lite

```ts
FlagRegistry.instance.clientGating(); // [] in lite
```

Only these reach the session payload. The big kit derives the set from widgets that name a flag (a
hand-written list, once forgotten, ships server-only names to browsers); lite has no widgets, so it is
empty until they are ported back ([`docs/scale/widgets.md`](../../../../docs/scale/widgets.md)). Names are
still not secret once client-gating: **a flag decides when something ships, not who may know it exists**
— hence `NOT_FOUND` with no key.

## `meta` answers `undefined` for a flag it does not know

A row can outlive its flag (retiring deletes the declaration first), so the platform list shows it as
orphaned rather than failing.

## What CI holds it to

`check-architecture.mjs` fails a flag past `expiresOn` or unread outside `flag/`; zero flags is the
normal state and passes.
