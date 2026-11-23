---
title: ServerOnly
description: ServerOnly.assert — the runtime tripwire that catches database or credential code reaching a client bundle, the ServerOnlyError it throws, and the two other defences it sits between.
---

# `ServerOnly`

```ts
import { ServerOnlyError } from "@loadbearing/errors";

export class ServerOnly {
  private constructor() {}

  // Call at the top of every server-only package barrel.
  public static assert(packageName: string): void {
    if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
      throw new ServerOnlyError(packageName);
    }
  }
}
```

The one import in `@loadbearing/core`, and why the package's single dependency is
[`@loadbearing/errors`](../../../errors/docs/index.md).

## Who calls it

Four barrels, first among their statements, before any other import can run side effects:

```ts
// packages/infrastructure/src/index.ts
import { ServerOnly } from "@loadbearing/core";
ServerOnly.assert("@loadbearing/infrastructure");
```

| Package | Why |
| --- | --- |
| `infrastructure` | connection pools, table shapes, queue and cache clients, vendor SDKs |
| `auth` | signing secrets, session handling |
| `composition` | wires them all together |
| `application` | use-cases that must only run behind the transport |

## Three defences, one mistake

| # | Defence | Catches it | Bypassed by |
| --- | --- | --- | --- |
| 1 | [`noRestrictedImports`](../../../../tooling/biome-config/docs/reference/boundary.md) in Biome, plus the ESLint boundary | authoring time | an `overrides` escape hatch, or a path nobody listed |
| 2 | **`ServerOnly.assert`** | runtime, on first import | never being reached because the import is tree-shaken |
| 3 | The CI bundle grep in `check-architecture.mjs` | build time | not building the app it greps |

> [!CAUTION]
> Three is calibrated to cost, not likelihood: a Drizzle import in the client ships your connection
> string's shape and full schema to anyone with devtools.

## Why the check goes through `globalThis`

```ts
if (typeof window !== "undefined") {   // TS2304: Cannot find name 'window'
```

> [!WARNING]
> **A `typeof` guard does not exempt an undeclared identifier** — TypeScript tolerates `typeof x` only
> for a *declared* `x`.

[`library.json`](../../../../tooling/tsconfig/docs/reference/presets.md) sets `lib: ["ES2024"]` with no
DOM, deliberately, so `window` is unknown. Widening `globalThis` to `{ window?: unknown }` performs the
same runtime test with a resolvable type. Adding `"DOM"` would destroy the property relied on; an
ambient `declare const window` collides with `@types/node`. Same shape as
[uuid's `crypto`](uuid.md#why-crypto-is-not-a-global-here).

## What it does not catch

- **A type-only import** — emits nothing, so nothing leaked.
- **A tree-shaken import** — the barrel's side effect is dropped; defence 3 covers it.
- **A non-browser sandbox defining `window`** — a possible false positive (none seen), failing loudly at
  startup rather than leaking silently.

## What it throws, and where the words went

```ts
ServerOnly.assert("@loadbearing/infrastructure");
// ServerOnlyError: SERVER_ONLY
//   context: { package: "@loadbearing/infrastructure" }
```

`Error.message` is `"SERVER_ONLY"` — [`errors`](../../../errors/docs/index.md) has no message field and
this throw gets no exception. The sentence lives where sentences live:

```ts
// packages/content/src/message/en/error.ts
"error.serverOnly":
  "{package} was imported into a client bundle. This is a leak, not a bundle-size problem — " +
  "it means database or credential code is reachable from the browser.",
```

```ts
ErrorCopy.message(translator, error.toJSON());
// "@loadbearing/infrastructure was imported into a client bundle. This is a leak, not a …"
```

The context key is `package` because the copy interpolates `{package}`; renamed, the sentence silently
shows a literal `{package}`, so both sides pin it with a test.

### Why the hardest case for prose still loses

| The case for prose | Why it does not hold |
| --- | --- |
| The reader is a developer at module load — no request, no locale, no `Translator`. | True, and beside the point. The reader still wants words; `content` is where words are. The throw site wants the code and the package name, which is what it has. |
| The prose is the payload — "this is a leak, not a bundle-size problem" is what stops someone reaching for a bundler setting. | It still says exactly that, from `error.serverOnly`, and now a developer reading Bengali can get it in Bengali. |
| It never crosses a wire, so the reasons for keeping text out of errors do not apply here. | One does. A `message` field on `AppError` is a field that gets *rendered* — by a toast, by a `<pre>` in an error boundary, by a log line pasted into a ticket. It is enforceable only with no exceptions, and here the exception costs nothing. |

The stack trace loses nothing:

```
ServerOnlyError: SERVER_ONLY
    at ServerOnly.assert (…)
    at packages/infrastructure/src/index.ts:2:12
```

The class names the fault, the frame the leaking package, and `{ package: … }` is a log-filterable field.

> [!NOTE]
> An earlier revision said not to invert `core` and `errors`; inverting them was the fix — `errors` is a
> zero-dependency leaf, the edge is acyclic, and `pnpm build:packages` builds `errors` first.

## See also

- [`@loadbearing/core`](../index.md)
- [Clock](clock.md) · [Result](result.md) · [Uuid](uuid.md)
- [The server-only boundary](../../../../tooling/biome-config/docs/reference/boundary.md) — defence 1
- [`@loadbearing/errors`](../../../errors/docs/index.md) — `ServerOnlyError`, and the rule with no exceptions
- [`@loadbearing/content`](../../../content/docs/reference/error-copy.md) — where `error.serverOnly` lives
