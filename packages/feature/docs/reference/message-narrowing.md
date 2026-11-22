---
title: Message narrowing
description: Why useMessages takes the namespace as its only argument, why the two-argument shape that looks equivalent constrains nothing, and why a missing key renders as itself.
---

# `useMessages`

```tsx
const { t } = useMessages("auth");
```

One argument, and the whole design turns on it.

## The shape that looks equivalent and is not

The obvious API is two arguments — namespace and key, together:

```ts
declare function t<N extends string>(ns: N, key: Extract<MessageKey, `${N}.${string}`>): string;

t("auth", "error.forbidden");   // compiles. The constraint is decorative.
```

**The key position is also an inference site**: TypeScript solves `N` from both arguments and widens it
until the pair fits. `useMessages("auth")` fixes `N` from one position first; the returned `t` takes
`NamespaceKeys["auth"] | NamespaceKeys[ShellNamespace]`, and an indexed access into a mapped type is
**not** an inference site, so it rejects. Hence `Translator.t` in
[`content`](../../../content/docs/index.md) keeps a flat `MessageKey` and all narrowing happens here, the
one place knowing the namespace statically.

> Verified both ways. If `t("nav.roles")` compiles in a component declaring `"auth"`, someone replaced
> the mapped type with a template-literal `Extract`.

## Why the shell is always in the union

```ts
type ScopedKey<N extends ClientNamespace> = NamespaceKeys[N] | NamespaceKeys[ShellNamespace];
```

`t("action.cancel")` works on an `"auth"`-only screen because the type states the runtime guarantee:
`ContentSource.resolve()` puts `common` and `error` in **every** snapshot from every source. A
component's key union and its actual snapshot are the same set — widen one alone and it breaks.

## `email` is unreachable, twice over

`N extends ClientNamespace` and `email` is a `ServerNamespace`, so the argument rejects it; the ESLint ban
on importing the server catalog closes the other route. Neither is redundant.

## A missing key renders as itself

`nav.roles` on screen — loud, local and greppable, pointing at the real fault (an undeclared
namespace); see [Translator](../../../content/docs/reference/translator.md#a-missing-key-renders-as-the-key)
for why not throw or fall back. Shell keys are always present, so only feature copy can show one.

## Why `useSyncExternalStore`

Navigation adds namespaces after mount, so the store is subscribed **once**, at the provider;
`useMessages` is a plain `useContext` read.

```ts
const read = useCallback(() => messages.translator, [messages]);
```

`MessageStore.translator` keeps a stable identity until `ensure()` adds something — not an
optimisation: `useSyncExternalStore` compares by reference, so a fresh `Translator` per read re-renders
forever. Hence `MessageStore` caches `cached` beside `snapshot`.

## Where the snapshot comes from

Inlined into the SSR payload, so the first byte has the right locale — client fetching means a
readable flash of English or a blocking request. `MessageStore.dehydrate()`/`restore()` are the two
halves; `apps/web`'s route loader calls `ensure()` for a missing namespace.
