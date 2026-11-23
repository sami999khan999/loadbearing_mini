---
title: AppError
description: AppError — why the message is the code, how the envelope round-trips, and why from() can return null.
---

# `AppError`

```ts
export type ErrorContext = Readonly<Record<string, string | number | boolean>>;

export interface FieldViolation {
  readonly field: string;
  readonly rule: string;   // → a MessageKey in content, never a sentence
  readonly params?: Readonly<Record<string, string | number>>;
}

export interface ErrorEnvelope {
  readonly code: ErrorCode;
  readonly context: ErrorContext;
  readonly fields?: readonly FieldViolation[];
  readonly traceId?: string;
}

export abstract class AppError extends Error {
  public constructor(code: ErrorCode, context?: ErrorContext, fields?: readonly FieldViolation[]);

  public readonly code: ErrorCode;
  public readonly context: ErrorContext;
  public readonly fields?: readonly FieldViolation[];

  public get retryable(): boolean;
  public toJSON(): ErrorEnvelope;

  public static isKnownCode(value: string): value is ErrorCode;
  public static from(envelope: ErrorEnvelope): AppError | null;
}

export class TransportError extends AppError {}

// The wire's trace id, bounded and character-checked. `Correlation.sanitise` in
// observability is a delegating alias — this is the one copy of the rule.
export class TraceIds {
  public static readonly MAX_LENGTH: number;
  public static sanitise(value: string | null | undefined): string | null;
}
```

---

## The code is passed to `super()`, and that is the whole trick

```ts
public constructor(
  public readonly code: ErrorCode,
  public readonly context: ErrorContext = {},
  public readonly fields?: readonly FieldViolation[],
) {
  super(code);
  …
}
```

`super(code)` makes `Error.message` the code. A first draft overrode `message` with a getter, which does
not typecheck (a get-only accessor cannot replace a mutable property); a constructor parameter is
simpler and a subclass cannot forget it:

```ts
export class ForbiddenError extends AppError {
  public constructor(permission: string, goalId?: string) {
    super("FORBIDDEN", goalId ? { permission, goalId } : { permission });
  }
}
```

`{ permission, goalId }` is what a log query filters and `content` interpolates — no third
representation.

---

## `Error.captureStackTrace` is not in the standard library

```ts
type StackTraceCapture = {
  captureStackTrace?: (target: object, constructorOpt?: unknown) => void;
};

(Error as StackTraceCapture).captureStackTrace?.(this, new.target);
```

A V8 extension undeclared by `lib: ["ES2024"]`, so a bare call fails `TS2339` — `core`'s `crypto`
problem ([uuid](../../../core/docs/reference/uuid.md)) with the same answer: name the one method, read it
off the value, independent of `@types/node`. The optional call is safe without V8.

---

## `from()` returns `null`, and callers must handle it

An envelope from the wire, Redis or a queue is untrusted, so the code is checked:

```ts
AppError.from({ code: "MADE_UP", context: {} }); // null
```

`CapabilitySet.from()`'s boundary; `isKnownCode` uses `Object.hasOwn` as `PermissionRegistry.isKnown`
does (`"constructor" in ERROR_CATALOG` is `true`). The result is a `TransportError` — code and context
survive, the class does not, which suffices since callers switch on `code`, never `instanceof`.

**The trace id is checked too** (it was once adopted verbatim): from the same untrusted envelope it would
ride every related log line — the log-injection hole `Correlation.sanitise` closes on the request path.
`from()` applies the same rule:

```ts
AppError.from({ code: "INTERNAL", context: {}, traceId: 'x" level=error' }); // no traceId
AppError.from({ code: "INTERNAL", context: {}, traceId: "a".repeat(500) })
  ?.toJSON().traceId?.length;                                               // 128
```

Over-long is truncated (probably still the upstream's id), wrongly shaped is dropped. **The rule lives
in `TraceIds` here and `Correlation.sanitise` delegates** — two copies would drift, and `observability`
may import `errors`, not the reverse.

---

## `fields` is omitted rather than empty

```ts
new ForbiddenError("x").toJSON(); // { code, context } — no `fields` key
```

Both mean "no violations", but only absence avoids inviting `fields.length` on a non-validation error.

---

## The subclasses, and what each carries

A code gets a class when something **throws** it with context. `RateLimitedError` and
`UnavailableError` are thrown by adapters (a 429'd endpoint, a failed upstream), never by the domain.

| Class | Code | Context |
| --- | --- | --- |
| `UnauthorizedError` | `UNAUTHORIZED` | `{ reason }`, defaulting to `"no-session"` |
| `ForbiddenError` | `FORBIDDEN` | `{ permission }`, plus `goalId` when scoped |
| `NotFoundError` | `NOT_FOUND` | `{ resource, id }` |
| `ConflictError` | `CONFLICT` | `{ resource, reason }` |
| `TwoFactorRequiredError` | `TWO_FACTOR_REQUIRED` | — |
| `ValidationError` | `BAD_REQUEST` | `{ fieldCount }` + `fields` |
| `InternalError` | `INTERNAL` | — (the original is held on a non-enumerable `cause`) |
| `RateLimitedError` | `RATE_LIMITED` | `{ scope }` — the endpoint, never the identity |
| `UnavailableError` | `UNAVAILABLE` | `{ dependency }`, plus `status` when known |
| `ServerOnlyError` | `SERVER_ONLY` | `{ package }` |
| `TransportError` | any | whatever the envelope carried |

### `ServerOnlyError` is the one thrown before anything else runs

```ts
// packages/core/src/primitive/server-only.ts
throw new ServerOnlyError(packageName);
```

It fires at module load in an already-broken browser build — the hardest case for "no message" — and
still carries only a code. The context key is **`package`** because it is `error.serverOnly`'s
`{package}` placeholder; a test asserts the key list
([the argument](../../../core/docs/reference/server-only.md#why-the-hardest-case-for-prose-still-loses)).

---

## See also

- [`@loadbearing/errors`](../index.md)
- [ErrorNormalizer](error-normalizer.md) — how anything thrown becomes one of these
- [catalog](catalog.md) — where `ErrorCode` and `retryable` come from
- [`ServerOnly`](../../../core/docs/reference/server-only.md) — the one caller that throws at module load
- [`content`'s `ERROR_COPY`](../../../content/docs/reference/error-copy.md) — where the words are
