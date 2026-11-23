---
title: "Result<T, E>"
description: Result, Ok, Err and Results — a discriminated union that narrows in every position, and the decision table for when a failure is a return value and when it is a thrown domain error.
---

# `Result<T, E>`

A two-case discriminated union: `Ok` and `Err` are classes (to carry behaviour), and `Result` is their
union, which is what narrows.

```ts
export type Result<T, E> = Ok<T, E> | Err<T, E>;
```

| Export | Kind | Carries |
| --- | --- | --- |
| `Result<T, E>` | type alias | the union — annotate with this |
| `Ok<T, E>` | class | `readonly kind: "ok"`, `readonly value: T` |
| `Err<T, E>` | class | `readonly kind: "err"`, `readonly error: E` |
| `Results` | static-only class | the `ok` / `err` factories |

Both classes implement `unwrapOr`, `mapOk` and `mapErr`, declared on an unexported `ResultBase`.

---

## Use it, or throw?

Wrong one way gives exception-driven flow; wrong the other, three lines of unwrapping at every call
site for things that cannot fail.

| Situation | Use |
| --- | --- |
| The operation fails as part of the normal business flow — validation, a lookup that legitimately misses, a parse of untrusted input | **`Result`** |
| An invariant is violated — the caller lacks permission, a referenced row must exist and doesn't, a config value is absent | **throw** an `AppError` subclass from `@loadbearing/errors` |

`ForbiddenError`, `NotFoundError` and `findByIdOrFail` throw — the caller cannot recover, and the
transport maps the error to a status once, at the edge. `Result` is for when the caller genuinely
*branches*.

> [!NOTE]
> **`Result` should be the minority pattern** — `strict` and `noUncheckedIndexedAccess` already force
> most branches; `Result` on every method is drift toward exception-free purism over readable
> use-cases.

---

## Usage

```ts
const parsed = Email.parse(input); // Result<Email, ParseError>

if (parsed.kind === "err") {
  return this.presenter.invalid(parsed.error); // narrowed to Err
}

return this.presenter.ok(parsed.value); // narrowed to Ok
```

`mapOk` and `mapErr` transform one side and pass the other through untouched:

```ts
Results.ok<number, string>(1)
  .mapOk((n) => n + 1)
  .unwrapOr(0); // 2

Results.err<string, number>("nope")
  .mapOk((n) => n + 1)   // not called
  .mapErr((e) => e.toUpperCase())
  .unwrapOr(0);          // 0
```

`unwrapOr` is the only exit and cannot throw; there is deliberately no `unwrap()`, the shortcut to
using `Result` everywhere and defeating it at every call site.

---

## Why a union rather than an abstract class

Every port here is an abstract class, so `Result` as a `type` needs justifying: it is the only shape
that narrows. A first draft — an abstract base with `isOk`/`isErr` getters — bought nothing:

```ts
if (parsed.isOk) {
  parsed.value; // ✗ Property 'value' does not exist on type 'Result<number, string>'
}
```

Type predicates (`isOk(): this is Ok<T, E>`) fix only the positive branch. Against this repo's flags:

| Position | abstract class | union |
| --- | --- | --- |
| `if (r.isOk()) { r.value }` | ✅ | ✅ |
| the `else` branch | ❌ stays `Result<T, E>` | ✅ narrows to `Err` |
| fall-through after `if (r.isErr()) return` | ❌ | ✅ |
| negative branch of `instanceof` | ❌ | ✅ |
| `switch (r.kind)` with no `default` | ❌ not exhaustive | ✅ exhaustive |

> [!IMPORTANT]
> Structural, not a missing annotation: **TypeScript can subtract a member from a union, not a class**,
> so a class `Result` has no "everything except `Ok`" to narrow to.

`r.kind === "ok"` narrows both ways and makes a `switch` exhaustive without `default`, so a third case
would be a compile error everywhere, not a silent fall-through.

### What it costs

A type alias carries no statics, so factories live on their own class:

```ts
Results.ok(value);   // not Result.ok(value)
Results.err(error);
```

That is the whole price. Factories beat `new Ok(1)` because `E` would infer as `unknown`;
`Results.ok<T, E = never>` defaults it and `Results.err<E, T = never>` flips the order. Direct
construction still works. `ResultBase` is unexported, emitted as a local `declare abstract class`.

---

## Tests

`tests/primitive/result.spec.ts` covers factories and `map`s, then pins every row of the narrowing
table — **compile-time assertions in a test's clothes**: `tests/` is in the tsconfig `include`, so a
non-narrowing regression fails `pnpm typecheck` first. Its `widen` helper matters: without it
`Results.ok(7)` infers as `Ok<number, string>`, which narrows trivially and proves nothing.

---

## See also

- [`@loadbearing/core`](../index.md)
- [Clock](clock.md) · [Uuid](uuid.md) · [ServerOnly](server-only.md)
