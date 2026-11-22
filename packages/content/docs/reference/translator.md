---
title: Translator
description: Translator and MessageSnapshot — one immutable shape that is the constructor argument, the SSR wire format, and the merge unit, plus twelve lines of interpolation and no i18n library.
---

# `Translator`, `MessageSnapshot`

```ts
export interface MessageSnapshot {
  readonly locale: Locale;
  readonly namespaces: readonly Namespace[];
  readonly base: MessageBundle;        // a fallback layer a source may fill; StaticContentSource leaves it empty
  readonly overrides: MessageBundle;   // the requested locale's copy
}

export class Translator {
  public constructor(private readonly snapshot: MessageSnapshot) {}

  public get locale(): Locale;
  public loaded(namespace: Namespace): boolean;
  public t(key: MessageKey, params?: MessageParams): string;
  public has(key: MessageKey): boolean;
  public with(overrides: MessageBundle): Translator;
  public static merge(a: MessageSnapshot, b: MessageSnapshot): MessageSnapshot;
}
```

---

## One shape, three jobs

`MessageSnapshot` is the constructor argument, the SSR JSON and the client-navigation merge unit — no
adapters between. **`base` is not a total `Record<MessageKey, string>`** — that forced all English, and
every locale, into every bundle ([namespace](namespace.md#types-are-erased-runtime-data-is-not)); a
snapshot covers the loaded `namespaces`. **Two layers:** `overrides` wins per key and `base`
answers the rest — today every bundle is total, so `StaticContentSource` sends `base: {}`, and the layer
exists for a source (a CMS) whose locales may be partial.

---

## `t()` — interpolation, and the two loud failures

```ts
t("error.field.tooShort", { field: "Reason", min: 10 });
// "Reason must be at least 10 characters."
```

`{name}` replacement in twelve lines, no library; ICU MessageFormat is right once plurals and gender
matter, and swapping is internal since every call goes through `t()`. `params` is
[`MessageParams`](namespace.md#messageparams), allowing `boolean` like `ErrorContext`, so error context
passes straight through.

### An unknown placeholder is left in place

```ts
t("error.field.required", { fiedl: "Email" });   // "{field} is required."
```

`"Hello {nmae}"` is unmistakably a call-site bug; `"Hello undefined"` looks like a data problem.

### A missing key renders as the key

```ts
t("auth.signIn");   // "auth.signIn"  — that namespace was never loaded
```

It names the exact string to grep for, and the bug is always a route that forgot a namespace.
Throwing would take down a healthy page; falling back to English ships the bug silently to a Bengali
customer. **Loud and local, never plausible.**

> [!NOTE]
> **The error and loading paths cannot reach this branch** — `error.*`, `action.*`, `state.*` are shell
> namespaces in every snapshot ([ContentSource](content-source.md)), and `ERROR_COPY` is typed to stay
> there ([error-copy](error-copy.md#the-value-type-is-shellmessagekey-and-that-is-load-bearing)).

---

## `with()` is immutable, `merge()` is a union

```ts
const forRecipient = shared.with({ "email.greeting": "Hi {name}," });
```

Per-recipient composition builds on a shared instance without mutating it — what makes a digest job
parallel-safe.

```ts
Translator.merge(current, added);   // namespaces deduplicated, both layers merged
```

Used when a navigation needs a namespace the page lacks; it takes `a`'s locale, since mixing locales is
a bug.

---

## What is *not* here

**No React** — `useMessages` and the provider live in `packages/feature`, since `apps/worker` needs copy
for emails and cannot import React; one `Translator` runs in SSR, browser, worker and Tauri. The mutable
holder that absorbs namespaces after first render is `MessageStore` (`translator/message-store.ts`),
whose `ensure()` `apps/web`'s route loader calls ([message narrowing](../../../feature/docs/reference/message-narrowing.md)).

---

## See also

- [namespace](namespace.md) — where `MessageKey` and `MessageParams` come from
- [ContentSource](content-source.md) — what builds a snapshot
- [error-copy](error-copy.md) — the one caller that must never hit the raw-key branch
