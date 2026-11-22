---
title: procedure-permissions
description: The map that guarantees no procedure ships ungated, the test that enforces it, and why the walker uses oRPC's own predicate.
---

# `ProcedurePermissions`

```ts
// src/catalog/index.ts — merged from one <subject>.permissions.ts per slice
export const PROCEDURE_PERMISSIONS: Readonly<Record<string, PermissionKey>>;

// src/registry/procedure-permissions.ts
export class ProcedurePermissions {
  public static required(path: string): PermissionKey | undefined;
  public static paths(): readonly string[];
}
```

It mirrors `@loadbearing/permissions`: `catalog/` holds team fragments and the merging index,
`registry/` the lookup class.

---

## What this is, and what it is not

**A transport-layer guarantee that no procedure ships ungated:** the oRPC base middleware fails closed
when `required(path)` is `undefined`, so an unmapped procedure denies every call. **Not the
authorization check** — the use-case decides with the goal scope in hand, which this map lacks. Defence
in depth: "I forgot" fails safe.

## `Object.hasOwn`, not a bare index

```ts
public static required(path: string): PermissionKey | undefined {
  return Object.hasOwn(PROCEDURE_PERMISSIONS, path) ? PROCEDURE_PERMISSIONS[path] : undefined;
}
```

`path` comes from the wire; a bare index walks the prototype, so `required("toString")` returns a
function — "gated" — handed to the capability check. `noUncheckedIndexedAccess` cannot see it (the type
claims `PermissionKey | undefined`). Same as `PermissionRegistry.isKnown` and `AppError.isKnownCode`.

## The coverage test needs a fixture

Coverage over the real contract proves only that today's paths are mapped; a walker that stopped
recognising procedures would pass over an empty list. So the spec also builds an `oc` fixture and
asserts the walker finds its paths:

```ts
const fixture = {
  task: {
    list: oc.route({ method: "GET", path: "/goals/{goalId}/tasks" })./* … */,
    reactivate: oc.route({ method: "POST", path: "/tasks/{taskId}/reactivate" })./* … */,
  },
};

expect(ContractWalker.paths(fixture).sort()).toEqual(["task.list", "task.reactivate"]);
```

That proves the walker still recognises a procedure, so a new slice with a missing gate fails.

## `isContractProcedure`, not `"~orpc" in node`

The walker tells a procedure (leaf) from a router (descend). The obvious check is oRPC's marker:

```ts
if (node && typeof node === "object" && "~orpc" in node) return [prefix.join(".")];
```

The tilde marks it internal; `@orpc/contract`'s `isContractProcedure` is the same check behind a
supported name that moves with the internals. The silent failure: a stale marker walks a procedure as an
object, `paths()` returns plausible internal keys, `missing` is empty and coverage stays green — so the
spec asserts a procedure is a leaf.

## Adding a slice

Three edits, in this order:

1. `src/<subject>/<subject>.procedures.ts` — the oRPC definitions.
2. `src/procedure/index.ts` — one line adding the slice to `contract`.
3. `src/catalog/<subject>.permissions.ts` plus one spread in `src/catalog/index.ts`.

Miss the third and coverage fails naming the ungated paths; miss the second and they are unreachable.
