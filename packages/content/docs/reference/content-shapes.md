---
title: The three content shapes
description: Why media and nav are separate shapes rather than one — and the rule that keeps a content edit from becoming a privilege escalation.
---

# Media and collections

`ContentSource` declares three shapes because each has a different edit model, validation story and
answer to "what happens on a CMS".

| Shape | Folder | Who edits it | Validated by |
| --- | --- | --- | --- |
| Keyed strings | `message/` | a translator, per locale | the `MessageKey` union, at compile time |
| Media references | `media/` | nobody — a key resolves to a manifest entry | `ImageKey`, at compile time |
| Repeating records | `collection/` | a content editor | Zod, at module load |

## The rule: content references the security surface, it never defines it

```ts
{ module: "rbac", labelKey: "nav.roles", icon: "check", order: 10 }
```

`module: "rbac"`, **not** `permission: "rbac.role.read"`. `ModuleRegistry` in
[`permissions`](../../../permissions/docs/index.md) maps that key to its gate and its route.

An editor can reorder, rename and re-icon the menu but **cannot** change what gates a module or where a
label points — a permission content field would make a CMS edit a privilege escalation, found by
accident years later. Three enforcements, latest-catching last:

1. **ESLint** bans the two symbols that would let this package name a permission, in
   `tooling/eslint-config/src/index.js`. The ban is scoped to `packages/content/src/**`, and
   `ModuleKey` is deliberately not on it.
2. **`NavRecord`** in `nav.data.ts` types `module` as `ModuleKey`, so a menu entry naming a module
   that does not exist fails to compile.
3. **A spec** asserts every `navItems` entry's module is a key of `GATES`, its icon is in the sprite,
   and its label key has copy behind it — the checks that survive the day these rows come from a
   database and the compiler stops helping.

> [!NOTE]
> The content gate greps this tree for the banned names, so even a **comment** naming one fails it —
> `nav.schema.ts`'s comment is worded to avoid the literal.

## Two types for one record, and why

`nav.schema.ts` types `module`, `labelKey` and `icon` as `z.string()`. `nav.data.ts` declares a
narrower `NavRecord` and pins the literal against it with `satisfies`:

```ts
const ITEMS = [...] as const satisfies readonly NavRecord[];
export const navItems: readonly NavItem[] = NavContract.collection.parse(ITEMS);
```

- **`satisfies NavRecord` is the authoring check** — while the data is a literal, a bad module key,
  missing icon or uncopied label fails the build.
- **`NavContract.collection.parse` is the boundary check** — still true when rows come from a database.
  The schema stays wide; narrowed to the unions it could not parse the untrusted input it exists for.

So the types stay separate: `NavItem` is *any* record, including a CMS's; `NavRecord` is what this repo
authors.

## Media is async in the seam and synchronous in the implementation

```ts
public abstract media(key: ImageKey): Promise<ResolvedMedia>;
```

`StaticMediaResolver` answers from the bundled manifest, so `StaticContentSource` returns
`Promise.resolve(...)` (`require-await` rejects an await-free `async`); the seam stays async for a
network CMS. `ImageKey` is **type-only**, so the worker's bundle gets no binaries; only
`StaticMediaResolver` value-imports `ImageManifest`.

## There is no `document()` shape, and there was

A fourth shape — `document(slug)`, a `DocumentContract` and `DocumentEntity` for rows no adapter
returned — had no caller and answered `null` for every slug; "it exists to come from a database" argues
for building it *with* the database. It was deleted: re-adding it costs what it cost idle (one method,
one implementation, one contract), and now every `ContentSource` method has a caller.

