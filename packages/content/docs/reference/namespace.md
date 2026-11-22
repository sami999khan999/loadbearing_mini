---
title: namespace
description: The closed MessageKey union derived from type-only imports — how the key guarantee survives splitting the runtime data into one chunk per locale and namespace.
---

# `namespace.ts`

The type layer — it emits no JavaScript, which is the trick.

```ts
import type { common } from "./en/common.js";
import type { error } from "./en/error.js";
// … one type-only import per namespace

interface NamespaceShape {
  readonly common: typeof common;
  readonly error: typeof error;
  // … one member per namespace
}

export type ShellNamespace = "common" | "error";
export type ClientNamespace = ShellNamespace | "nav" | "auth" | /* … */;
export type ServerNamespace = "email";
export type Namespace = ClientNamespace | ServerNamespace;

export type NamespaceKeys = { [K in Namespace]: keyof NamespaceShape[K] & string };

export type MessageKey = NamespaceKeys[Namespace];
export type ShellMessageKey = NamespaceKeys[ShellNamespace];

export type NamespaceBundle<N extends Namespace> = Record<NamespaceKeys[N], string>;
export type MessageBundle = Partial<Record<MessageKey, string>>;
export type MessageParams = Readonly<Record<string, string | number | boolean>>;

export const SHELL_NAMESPACES: readonly ShellNamespace[] = ["common", "error"];
export const CLIENT_NAMESPACES: readonly ClientNamespace[] = ["common", "error", /* … */];
```

---

## Types are erased; runtime data is not

`verbatimModuleSyntax` erases `import type`, so this module names every English file yet is, at
runtime, two arrays. `MessageKey` stays one closed union while copy lives in chunks only
[`CLIENT_CATALOG`](../index.md) reaches by dynamic import, one locale × namespace at a time. An earlier
merged `en` object gave the same union and a worse runtime — all English resident, every locale imported
statically, browsers downloading Bengali and email copy. **The merge was the bug**, not the union.

---

## `NamespaceKeys` is a mapped type deliberately

The tempting alternative is a template-literal constraint, and it silently does nothing:

```ts
declare function t<N extends string>(ns: N, key: Extract<MessageKey, `${N}.${string}`>): string;
t("auth", "error.forbidden");   // compiles — the constraint is decorative
```

The key position is also an inference site, so `N` widens; `NamespaceKeys[N]` (indexed access into a
mapped type) is not, and rejects it — verified both ways
([message narrowing](../../../feature/docs/reference/message-narrowing.md)). Deriving from the module
type also handles `common`, whose keys (`action.save`, `state.loading`) **do not start with its name**.

---

## `ShellMessageKey` vs `MessageKey`

| Type | Means | Used by |
| --- | --- | --- |
| `MessageKey` | any key in any namespace | `t()`, `MessageBundle` |
| `ShellMessageKey` | only keys guaranteed present in every snapshot | `ERROR_COPY`, `FIELD_RULE_COPY` |

Shell namespaces are in every snapshot; others load on request, and an unloaded key renders as itself —
fine for feature copy, wrong on an error page. Typing
[`ERROR_COPY`](error-copy.md#the-value-type-is-shellmessagekey-and-that-is-load-bearing) against the shell
makes that a compile error.

---

## `NamespaceBundle<N>` is total, and scoped per namespace

```ts
// bn/error.ts
export const error: NamespaceBundle<"error"> = {
  "error.forbidden": "এটি করার অনুমতি আপনার নেই।",
  "action.save": "সংরক্ষণ",   // compile error — that key belongs to `common`
};
```

Two properties at once:

- **Total** — an untranslated `en` key fails `tsc` in every locale. It was `Partial` until `P5.9`; what
  "incremental translation" actually produced was fifteen unnoticed gaps, four in `common` rendered by
  six components. **`tsup`'s DTS build misses this; only `pnpm typecheck` catches it**, so typecheck is
  the gate.
- **Per namespace** — another namespace's key is a compile error, so `bn/nav.ts` cannot ship auth copy in
  the nav chunk. **The chunk boundary is the type boundary.**

The cost: a locale cannot land half-finished, and an English fallback beneath it became unreachable —
so `23.15` dropped it; `StaticContentSource` leaves `base` empty and English arrives in `overrides` like
any locale. English files are `as const`, the source the union derives *from*, so English's own
completeness is the one thing nothing checks and everything depends on.

---

## `MessageParams`

```ts
export type MessageParams = Readonly<Record<string, string | number | boolean>>;
```

`boolean` because `ErrorContext` allows it, so `ErrorCopy.message` passes context straight to `t()`;
narrowing it breaks the key call site and invites a cast.

---

## Adding a namespace

One type-only import, one `NamespaceShape` member, the union (`ClientNamespace` or `ServerNamespace`),
and `CLIENT_NAMESPACES` if client-side. `ShellNamespace`, `NamespaceKeys`, `MessageKey`,
`ShellMessageKey`, `NamespaceBundle`, `MessageBundle` and `MessageParams` are untouched, and no consumer
changes. `CLIENT_CATALOG` then fails to compile until it has the new cells — why the union and the catalog
are separate declarations.

---

## `auth` and `account` are two namespaces, and the split is about the chunk

`auth` grew to 82 keys spanning before and after a session — nobody is in both — and since a namespace
is a chunk, `/forgot-password` (three strings) downloaded enrolment copy, backup-code warnings, linked
accounts and the session table. The line is the session, not the feature area:

| Namespace | Loaded by | Holds |
|---|---|---|
| `auth` | the `(shell)` sign-in routes | sign-in, sign-up, verification, reset, the two-factor *challenge*, social |
| `account` | `settings/*` | profile, password, email, two-factor *enrolment*, backup codes, linked accounts, sessions |
| `nav` | the signed-in layout | the chrome both halves render: sign-out, the settings links, the organization switcher |

**Five strings appear in both, by design** (`name`, `resetNewPassword`, `twoFactorCode`,
`twoFactorFailed`, `socialFailed`): a shared namespace would load with either half, the thing being fixed,
and identical English is no promise in an inflecting language. **Chrome keys went to `nav`**, which every
signed-in layout loads — so `sign-out.button.tsx` reads `nav` though it lives in `feature/src/auth/`.
Folders group by feature; namespaces by *when they download*.

---

## See also

- [error-copy](error-copy.md) — the one consumer of `ShellMessageKey`
- [Translator](translator.md) — what happens to a key whose namespace never loaded
- [ContentSource](content-source.md) — where `SHELL_NAMESPACES` is enforced
