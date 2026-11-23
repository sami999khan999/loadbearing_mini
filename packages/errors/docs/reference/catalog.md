---
title: "ERROR_CATALOG"
description: ERROR_CATALOG and HTTP_STATUS — a closed code union, why the metadata is transport-agnostic, and why the status map is quarantined from the domain layer.
---

# `ERROR_CATALOG`

```ts
export type ErrorSeverity = "expected" | "unexpected";

export interface ErrorMeta {
  readonly retryable: boolean;
  readonly severity: ErrorSeverity;
}

export const ERROR_CATALOG: { readonly [code: string]: ErrorMeta };
export type ErrorCode = keyof typeof ERROR_CATALOG;
```

Team fragments merged in a platform barrel, `as const satisfies Record<string, ErrorMeta>`, `ErrorCode`
via `keyof typeof` — as [permissions' `CATALOG`](../../../permissions/docs/reference/permission-registry.md):
a closed union, so a misspelled code fails to compile.

The ten shipped codes:

| Code | `retryable` | `severity` | Thrown by |
| --- | --- | --- | --- |
| `UNAUTHORIZED` | no | expected | `UnauthorizedError` |
| `FORBIDDEN` | no | expected | `ForbiddenError` |
| `NOT_FOUND` | no | expected | `NotFoundError` |
| `CONFLICT` | no | expected | `ConflictError` |
| `BAD_REQUEST` | no | expected | `ValidationError` |
| `TWO_FACTOR_REQUIRED` | no | expected | `TwoFactorRequiredError` |
| `RATE_LIMITED` | **yes** | expected | an adapter |
| `UNAVAILABLE` | **yes** | unexpected | an adapter |
| `INTERNAL` | no | unexpected | `InternalError`, via `ErrorNormalizer` |
| `SERVER_ONLY` | no | unexpected | `ServerOnlyError`, from `core` at module load |

**Every code has a class; two are adapter-only.** `RateLimitedError` takes the limiter's name,
`UnavailableError` a dependency and optional status (`("smtp")`, `("openai.embeddings", 503)`). The failed
dependency is the whole diagnostic, and carrying it in a message rather than `ErrorContext` once let a
vendor's response body reach the wire.

**`SERVER_ONLY` has `500` but is never served** — the total record needs a number, and the module that
would serve it is the one that failed to load.

---

## The metadata is transport-agnostic on purpose

**`retryable` is a fact about the code**, declared once so the query client and BullMQ cannot drift (it
was once an untyped cast over three hardcoded codes):

```ts
if (!ERROR_CATALOG[normalized.code].retryable) return false;
```

**`severity` separates a log line from an alert:** `FORBIDDEN` is the system working, `UNAVAILABLE` is
us broken — decided once beside the code.

---

## `TWO_FACTOR_REQUIRED` is not really a failure

A sign-in fork, a code so nothing matches `error.message.includes("two-factor")` — which broke on
rewording and in every non-English locale. A code cannot be reworded.

---

# `HTTP_STATUS`

```ts
export const HTTP_STATUS: Readonly<Record<ErrorCode, number>>;
```

**Total**, so a new code fails to compile without a status; a test catches drift the other way:

```ts
expect(Object.keys(HTTP_STATUS).sort()).toEqual(Object.keys(ERROR_CATALOG).sort());
```

## Why it lives in `transport/` and who may not import it

`ForbiddenError` is domain; `403` is transport — a NestJS filter mapping the same `code` to
`ForbiddenException` proves the swap. With both in this package, a lint rule keeps `application` off the
numbers:

```js
{
  files: ["packages/application/src/**/*.ts"],
  rules: {
    "no-restricted-imports": ["error", {
      paths: [{
        name: "@loadbearing/errors",
        importNames: ["HTTP_STATUS"],
        message: "A status code is a transport concern. Throw the error; the adapter maps it.",
      }],
    }],
  },
}
```

It bans the **import name**, not the module (`application` imports `ForbiddenError` constantly) — the
same mechanism as `content`'s `PermissionKey` ban. `UNAUTHORIZED` and `TWO_FACTOR_REQUIRED` share `401`;
the client branches on the code.

---

## Adding a code

1. A fragment in `catalog/` (or `core.errors.ts` if shared).
2. `HTTP_STATUS` — fails to compile until done.
3. `ERROR_COPY` in `content` — likewise, so no code ships without a sentence.

Most slices need none: `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` are the norm; add a code only when a caller
would branch on it.

---

## See also

- [`@loadbearing/errors`](../index.md)
- [AppError](app-error.md) — where `ErrorCode` is consumed
- [ErrorNormalizer](error-normalizer.md) — what guarantees a valid code
