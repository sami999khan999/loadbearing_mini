---
title: ErrorNormalizer
description: ErrorNormalizer — why detection is structural rather than instanceof, and how the original error is kept for logs while staying out of the envelope.
---

# `ErrorNormalizer`

```ts
export class ErrorNormalizer {
  public static normalize(thrown: unknown): AppError;
}
```

Every thrown value crosses this before transport, logging or rendering, so the oRPC interceptor is three
lines with no fall-through.

```ts
ErrorNormalizer.normalize(new ForbiddenError("x"));      // itself
ErrorNormalizer.normalize(zodError);                     // ValidationError
ErrorNormalizer.normalize(new Error("pg: relation …"));   // InternalError
ErrorNormalizer.normalize("boom");                       // InternalError
ErrorNormalizer.normalize(undefined);                    // InternalError
```

`normalize` is **total** — `throw "boom"` and rejections with `undefined` really happen.

---

## Detection is structural, not `instanceof`

```ts
private static isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { code?: unknown; toJSON?: unknown };

  return (
    typeof candidate.code === "string" &&
    AppError.isKnownCode(candidate.code) &&
    typeof candidate.toJSON === "function"
  );
}
```

Two copies of this package in a process (hoisting, a bundled dependency, the SSR/client boundary) make
two class identities, so `instanceof` silently says `false` and a `FORBIDDEN` collapses to `INTERNAL`
with no warning. A known `code` plus a callable `toJSON` survives duplicates — the same reason callers
switch on `code`. A test pins it: a look-alike literal keeps its code; an unknown code does not.

---

## Zod is matched by shape, not imported

```ts
private static isSchemaError(value: unknown): value is { issues: readonly SchemaIssue[] };
```

Importing `zod` would end the zero-dependency rule, so a schema error is anything with an `issues` array
of entries with a `path` array and string `code` — Zod's contract, and any look-alike validator's.
`SchemaIssue` declares only `path`, `code`, `minimum`, `maximum`. **Both bounds travel** —
`min(8).max(64)` gives `{ min, max }`; returning at the first bound once left `error.field.tooLong`
rendering a literal `{max}`.

---

## The original is kept for logs and cannot reach the envelope

```ts
export class InternalError extends AppError {
  public override readonly cause: unknown;

  public constructor(cause?: unknown) {
    super("INTERNAL");
    Object.defineProperty(this, "cause", {
      value: cause,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}
```

**Non-enumerable is the point:** a logger reads `error.cause`; `JSON.stringify` skips it and `toJSON()`
never names it, so a Postgres message full of table names never reaches a client — closed here, not in
every adapter. Asserted:

```ts
const secret = 'connection to db-prod-01 refused: relation "user_api_keys" does not exist';
const normalized = ErrorNormalizer.normalize(new Error(secret));

expect(JSON.stringify(normalized.toJSON())).not.toContain("user_api_keys");
expect(JSON.stringify(normalized)).not.toContain("db-prod-01");
expect(normalized.cause).toBeInstanceOf(Error);   // still there for the logger
```

`override` is required: `Error.cause` is in the ES2022 lib and `noImplicitOverride` checks it.

---

## Rule names, never library tokens

Zod's codes are open and change between majors, so an unknown one becomes `"invalid"` rather than an
uncopied library token:

| Zod issue code | `rule` |
| --- | --- |
| `invalid_type` | `required` |
| `too_small` | `tooShort` |
| `too_big` | `tooLong` |
| `invalid_format`, `invalid_string` | `invalidFormat` |
| anything else | `invalid` |

So `content`'s `FIELD_RULE_COPY` is deliberately not total; an unknown rule falls back to
`error.unexpected`.

---

## See also

- [`@loadbearing/errors`](../index.md)
- [AppError](app-error.md) — the shape this produces
