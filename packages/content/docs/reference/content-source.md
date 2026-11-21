---
title: ContentSource
description: The abstract seam a CMS slots into, StaticContentSource behind it, and why the shell namespaces are a property of the base class rather than a convention.
---

# `ContentSource`, `StaticContentSource`

```ts
export abstract class ContentSource {
  public static readonly SHELL: readonly Namespace[] = SHELL_NAMESPACES;

  protected static resolve(requested: readonly Namespace[]): readonly Namespace[] {
    return [...new Set([...ContentSource.SHELL, ...requested])];
  }

  public abstract messages(locale: Locale, namespaces: readonly Namespace[]): Promise<MessageSnapshot>;
  public abstract translator(locale: Locale, namespaces: readonly Namespace[]): Promise<Translator>;
  public abstract media(key: ImageKey): Promise<ResolvedMedia>;
  public abstract nav(): Promise<readonly NavItem[]>;
}
```

---

## Why an abstraction with one implementation

`StaticContentSource` is the only implementation, and the seam earns its place: a CMS later is one
`Container` line, not a rewrite of every screen.

```ts
this.content = new StaticContentSource(SERVER_CATALOG);
// later:
// this.content = new DbContentSource(this.database, this.cache);
```

**Every method is async though the static implementation mostly is not** — a `DbContentSource` cannot
be synchronous, so a sync seam would make the swap breaking everywhere.

> [!CAUTION]
> `require-await` is an error in `packages/*/src/**`, so an await-free method satisfying an async
> signature returns `Promise.resolve(x)` instead of being `async` — same type and call sites, no
> exemption, no false claim of asynchrony. `messages()` and `translator()` really await.

---

## The shell is a property of the seam

`resolve()` is `protected static`, and every implementation runs its request through it:

```ts
await new StaticContentSource().messages("bn", []);
// namespaces: ["common", "error"]
```

So "`common` and `error` are always there" is enforced by the base class: a route declaring `["auth"]`
still gets error copy and loading states, and a `DbContentSource` inherits it. That is what makes
[`ERROR_COPY`](error-copy.md#the-value-type-is-shellmessagekey-and-that-is-load-bearing) safe on any
route.

---

## `StaticContentSource`

```ts
public constructor(private readonly catalog: MessageCatalog = CLIENT_CATALOG) {
  super();
}
```

The default is the client catalog; the server passes `SERVER_CATALOG`, keeping `email` server-only
without a second entrypoint.

### One bundle per locale, and `base` stays empty

```ts
const overrides = await StaticContentSource.load(this.catalog[locale], wanted);
return { locale, namespaces: wanted, base: {}, overrides };
```

Every shipped bundle is a total `NamespaceBundle`, so there is no gap for an English layer to fill
(`23.15` dropped it); a CMS source is free to fill `base`.

### A namespace the catalog cannot serve is skipped, not thrown

```ts
const present = namespaces
  .map((namespace) => loaders[namespace])
  .filter((loader): loader is BundleLoader => loader !== undefined);
```

A client catalog has no `email` cell, so asking yields no keys and `t()` renders the key: **a browser
structurally cannot obtain server-only copy** — a property of the data, not a check.
`noUncheckedIndexedAccess` forces the `| undefined` lookup and the filter.

---

## Why the contract is short rather than stubbed

`media()` and `nav()` joined only once `asset`'s manifest and the nav collection existed. An abstract
method cannot be deferred — it is a compile error in every subclass — so declaring it early means
implementing early or stubbing a throw, and **a seam whose implementations throw is worse than a shorter
seam**: it looks complete, typechecks everywhere, and fails at runtime in whichever screen calls first.
Adding a method later is mechanical.

**Not written yet:** `BundledContentSource`, with the desktop app — every locale statically imported,
`snapshotSync` for a first render with no await or chunk fetch.

---

## See also

- [Translator](translator.md) — what `translator()` hands back
- [namespace](namespace.md) — `SHELL_NAMESPACES` and the union it comes from
- [error-copy](error-copy.md) — the caller that depends on the shell guarantee
