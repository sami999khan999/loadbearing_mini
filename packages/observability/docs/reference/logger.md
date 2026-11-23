---
title: Logger
description: The seam, why it returns void rather than a promise, what failure() reads off an AppError, and where the redaction line sits.
---

# `Logger`

```ts
export abstract class Logger {
  protected abstract write(entry: LogEntry): void;
  public abstract child(bound: LogFields): Logger;

  public emit<C extends EventCode>(code: C, fields: EventFields<C>): void;
  public failure(thrown: unknown, fields?: LogFields): void;
  public threshold(): LogLevel;
}

export class JsonLogger extends Logger {}    // JSON lines to stdout, the default
export class SilentLogger extends Logger {}  // TestContainer, and logging genuinely off
```

---

## `void`, not `Promise<void>`

Every other seam is async, even where the implementation is not; this one is not, on purpose. An async
logger makes each line a scheduling decision — `no-floating-promises` on every call, `void log.emit(...)`
noise, and awaited logs reordering hot paths. It writes to a file descriptor and moves on; losing a line
in a crash is acceptable, unlike `ActivityLogger`. **Do not "fix" this to match the other ports.**

## `emit` is concrete, `write` is abstract

Level filtering, sampling, bound-field merging and redaction run in the base class; `write` only
serialises a policy-checked `LogEntry`, so no sink can forget the threshold.

## `failure()` reads what the wire cannot

```ts
public failure(thrown: unknown, fields: LogFields = {}): void
```

Every caught error's path, in order:

1. **Normalised** — `ErrorNormalizer.normalize()` makes an unknown throw an `InternalError` (structurally,
   so two copies of `errors` in one process work).
2. **Level from severity** — `ERROR_CATALOG[code].severity`: `expected → warn`, `unexpected → error`
   ([errors · catalog](../../../errors/docs/reference/catalog.md)).
3. **Context flattened** — `error.context` already has log-field value types and spreads in; `error.fields`
   collapses to `violations: "email,password"`.
4. **The cause** — `InternalError` keeps the original on a **non-enumerable** `cause`, so `toJSON()` never
   ships a Postgres string full of table names to a client. The logger is the one reader allowed it.

```ts
logger.failure(new InternalError(new Error('relation "users" does not exist')));
// {"level":"error","event":"error.raised","code":"INTERNAL",
//  "cause":"Error: relation \"users\" does not exist","stack":"…"}
```

**Stacks only for `unexpected`**, truncated — enough to find the throw, not enough for a retry storm to
become the bill.

## `child()` is how a trace id rides

```ts
const scoped = logger.child({ traceId });
```

Bound fields merge into the child's lines without leaking to the parent; the innermost wins. Not ambient
state: `AsyncLocalStorage` is Node-only (this runs in the Tauri webview) and the `Container` holds no
request-scoped state, so the child travels with the `Principal`.

## Redaction is a backstop, not the defence

`Redactor` matches the field *name* (lowercased, separators stripped) by substring — `token`,
`password`, `secret`, `authorization`, `cookie`, `credential`, `apikey`, `sessionid`, `passphrase`,
`privatekey` — and writes `[redacted]`, keeping the key. Substring, because a prefix misses `userToken`
and an exact list misses `x-api-key`. No hit returns the original object. `EventShape` is the first
defence (undeclared fields cannot be logged); this catches what a bare-`LogFields` `child()` binding
drags in. Redacting at the logger, not each call site, is what holds.
