---
title: Clock
description: Clock, SystemClock and FixedClock — why time is an injected dependency, and the one rule that makes every time-dependent business rule synchronously testable.
---

# `Clock`

```ts
export abstract class Clock {
  public abstract now(): Date;
}

export class SystemClock extends Clock {
  public override now(): Date {
    return new Date();
  }
}

export class FixedClock extends Clock {
  public constructor(private readonly fixed: Date) {
    super();
  }

  public override now(): Date {
    return this.fixed;
  }

  public advance(ms: number): FixedClock {
    return new FixedClock(new Date(this.fixed.getTime() + ms));
  }
}
```

---

## The rule

> [!IMPORTANT]
> **No code anywhere in `packages/` calls `Date.now()` or `new Date()` to make a decision.**
> Take a `Clock` and call `now()`.
>
> Formatting a timestamp for display is not a decision. Comparing one to a deadline is.

The one exception is `Uuid.v7()`, inside `core`, reading `Date.now()` to build an id prefix — no decision.

---

## Why this is not over-engineering

It pays for itself by volume — deadlines, SLA and escalation windows, token expiry, cache TTLs,
rate-limit buckets are all rules needing tests, and the real clock means sleeping or flakiness.
`FixedClock` makes "overdue at exactly midnight?" a synchronous assertion:

```ts
const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
const task = Task.dueAt(new Date("2026-01-01T00:00:00.001Z"));

expect(task.isOverdue(clock)).toBe(false);
expect(task.isOverdue(clock.advance(2))).toBe(true);
```

---

## `advance()` returns a new instance

```ts
public advance(ms: number): FixedClock {
  return new FixedClock(new Date(this.fixed.getTime() + ms));
}
```

Not `this.fixed = …` — a mutable shared clock makes assertions order-dependent, failing a reordered or
`.only`-ed test for unrelated reasons; immutability also lets both clocks sit in one expression (above).

---

## Why an abstract class and not an interface

Every *port* is an abstract class ([`Result`](result.md) is a union, but a return value, not an injected
dependency): under [`verbatimModuleSyntax`](../../../../tooling/tsconfig/docs/reference/base.md) an
interface is erased and cannot be an injection token, while an abstract class is both type and token.

---

## `SystemClock` vs `FixedClock`

| | Where it is constructed |
| --- | --- |
| `SystemClock` | once, in the composition root — see `composition` |
| `FixedClock` | in tests, per test |

Nothing else constructs one; a use-case calling `new SystemClock()` undoes the abstraction.

---

## Tests

`tests/primitive/clock.spec.ts` asserts `now()` is fixed and `advance()` does not mutate:

```ts
it("advances without mutating", () => {
  const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
  const later = clock.advance(60_000);

  expect(later.now().toISOString()).toBe("2026-01-01T00:01:00.000Z");
  expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
});
```

---

## See also

- [`@loadbearing/core`](../index.md)
- [Result](result.md) · [Uuid](uuid.md) · [ServerOnly](server-only.md)
