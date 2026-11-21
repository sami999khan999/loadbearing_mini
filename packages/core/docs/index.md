---
title: "@loadbearing/core"
description: Five primitives every other package may need and no feature owns — Clock, Result, Uuid, Token, ServerOnly. One dependency, and it is a leaf.
---

# `@loadbearing/core`

One edge above the bottom of the graph. Everything may import it; it imports only
[`@loadbearing/errors`](../../errors/docs/index.md) (a zero-dependency leaf), because
[`ServerOnly.assert`](reference/server-only.md) throws and nothing throws a bare `Error`. Nothing in
`core` can be faked, so the bar for adding to it is high.

| | |
| --- | --- |
| **Package** | `@loadbearing/core` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/errors` — and nothing else, ever |
| **Used by** | every other package |
| **Environment** | isomorphic — server, browser, and Tauri webview |
| **Build** | `tsup` → `dist/index.js` + `dist/index.d.ts` |

```
packages/core/
├── vitest.config.ts      ← resolve.conditions: ["development"], for the errors import
├── src/
│   ├── index.ts          ← the public barrel; names only folder barrels
│   ├── import.ts         ← ServerOnlyError, from @loadbearing/errors
│   └── primitive/
│       ├── index.ts
│       ├── clock.ts      → Clock, SystemClock, FixedClock
│       ├── result.ts     → Result, Ok, Err, Results
│       ├── uuid.ts       → Uuid
│       ├── token.ts      → Token
│       └── server-only.ts → ServerOnly
└── tests/
    └── primitive/
        ├── clock.spec.ts
        ├── result.spec.ts
        ├── server-only.spec.ts
        └── uuid.spec.ts
```

---

## What belongs here

Two conditions, both required:

1. **Every other package might need it** — "two packages need it" means it belongs to whichever owns
   the concept.
2. **No feature owns it** — a `Deadline` belongs to the domain, however generic it looks.

Anything here can never be faked (there is no seam below `core`), which is why there are five exports,
not forty.

---

## The five primitives

### [`Clock`](reference/clock.md) — time as an injected dependency

```ts
export abstract class Clock {
  public abstract now(): Date;
}
```

`SystemClock` in production, `FixedClock` in tests, enforcing:

> [!IMPORTANT]
> **No code anywhere in `packages/` calls `Date.now()` or `new Date()` for a decision.**
> Formatting a display string is fine. Deciding whether something is overdue is not.

`Uuid.v7()` is the one sanctioned exception, and it is inside `core` itself — see
[uuid](reference/uuid.md).

### [`Result`](reference/result.md) — expected failure as a return value

```ts
Results.ok<number, string>(1).mapOk((n) => n + 1).unwrapOr(0); // 2
Results.err<string, number>("nope").unwrapOr(0);               // 0

if (parsed.kind === "err") {
  return this.presenter.invalid(parsed.error); // narrowed to Err
}
```

A discriminated union (`Ok<T, E> | Err<T, E>`), the only shape that narrows in an `else`, after an
early return and in an exhaustive `switch`. The *minority* pattern: `Result` is for failures the caller
branches on; invariant violations throw a domain error ([result](reference/result.md) has the table).

### [`Uuid`](reference/uuid.md) — time-ordered primary keys

```ts
Uuid.v7();               // "0194a5c3-8f21-7b4e-9a02-3c8d1f6e0a7b"
Uuid.isValid(someInput); // boolean
```

v7, not v4, so inserts land at the B-tree's tail; the trade-off (ids leak creation time) is documented.

### [`Token`](reference/token.md) — an opaque random string, and the digest of one

```ts
export class Token {
  public static random(bytes = 32): string;
  public static hash(value: string): Promise<string>;
}
```

`random()` goes to the recipient, `hash()` to the table. It is here, not beside `ApiKeyHasher` in
`auth`, because `application` (hashing an invitation to save) and `infrastructure` (hashing to look up)
both need it and neither can reach `auth`.

### [`ServerOnly`](reference/server-only.md) — a runtime bundle-leak tripwire

```ts
// packages/infrastructure/src/index.ts
import { ServerOnly } from "@loadbearing/core";
ServerOnly.assert("@loadbearing/infrastructure");
```

First in four barrels — `application`, `infrastructure`, `auth`, `composition` — the second of three
defences against server code reaching the browser.

---

## Two things that do not compile the obvious way

Both from `library.json`'s `lib: ["ES2024"]` with **no DOM** (what keeps the package honestly
isomorphic), and both found by running the build:

| Written the obvious way | What happens | What the code does instead |
| --- | --- | --- |
| `typeof window !== "undefined"` | `TS2304: Cannot find name 'window'` — a `typeof` guard needs a *declared* binding | `typeof (globalThis as { window?: unknown }).window !== "undefined"` |
| `crypto.getRandomValues(…)` | compiles **only** because a spec file imports vitest, which drags `@types/node` into the program | a four-line `WebCrypto` type read off `globalThis` |

> [!CAUTION]
> The second is nastier: green today, broken the moment `core`'s tests move, in a package fourteen
> depend on ([uuid](reference/uuid.md#why-crypto-is-not-a-global-here)).

---

## One folder, two barrels

Everything lives in `primitive/` (value types and small classes with no layer role, as everywhere —
`content` uses it for `Locale`); `src/` holds only `index.ts` and `import.ts`
([Folders](../../../docs/opinions/folders.md)). The root barrel re-exports `primitive/index.ts`, so moving
`clock.ts` to a future `time/` touches two files.

**If `core` ever needs a second folder, it has grown past its job.**

---

## Testing

Specs mirror `src/` under `tests/` (`src/primitive/clock.ts` → `tests/primitive/clock.spec.ts`).
`vitest.config.ts` narrows `include` to `tests/**/*.spec.ts` so `dist/` output is never picked up, and
`tsconfig.json` includes `tests/**` so `pnpm typecheck` covers specs.

```bash
pnpm --filter @loadbearing/core test
```

---

## See also

- [Clock](reference/clock.md) · [Result](reference/result.md) · [Uuid](reference/uuid.md) · [Token](reference/token.md) · [ServerOnly](reference/server-only.md)
- [`@loadbearing/tsconfig` · base](../../../tooling/tsconfig/docs/reference/base.md) — where `lib: ["ES2024"]` and `noUncheckedIndexedAccess` come from
