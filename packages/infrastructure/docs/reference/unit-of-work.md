---
title: Unit of work
description: Why AsyncLocalStorage rather than a tx parameter, how nesting behaves, and the five-line test that is the only proof the transaction is real.
---

# `PgUnitOfWork` and `TransactionScope`

```ts
public override async run<T>(work: () => Promise<T>): Promise<T> {
  return this.database.client.transaction((tx) => this.scope.within(tx, work));
}
```

The important class is the three-line `TransactionScope`.

## Why not a `tx` parameter

`save(task, tx?)` works and puts a database concept into `application` — a port that describes Postgres.
`AsyncLocalStorage` costs nearly nothing and keeps the transaction invisible above this package;
`BaseRepository` is the only reader:

```ts
protected get db() {
  return this.scope.current() ?? this.database.client;
}
```

**The one acceptable ambient context:** scoped to one `run()`, written in one place, read only by
`BaseRepository` — unlike a request-scoped container (banned), the difference is lifetime.

**One `TransactionScope` per container.** `PgUnitOfWork` and every repository must share the instance, or
one writes outside the transaction while looking inside — nothing fails, the audit row just escapes the
rollback. No type catches it; check `container.ts` by eye.

## Nesting joins, it does not open a second connection

```ts
public override async run<T>(work: () => Promise<T>): Promise<T> {
  return this.db.transaction((tx) => this.scope.within(tx, work));
}

private get db(): DrizzleClient {
  return this.scope.current() ?? this.database.client;
}
```

**`this.db`, never `this.database.client`** — so a nested `run()` is a `SAVEPOINT` on the same connection,
one atomic unit. Off the pool (the shipped bug once) it is a second independent transaction: the inner
commits when the outer rolls back, the two deadlock on timing, and single-level tests pass.
`tests/transaction/pg-unit-of-work.spec.ts` pins it.

**A propagated inner failure rolls back the outer too** — so optional side effects go after commit or
into an event; a *caught* inner failure rolls back only to its savepoint. `PgOrganizationFounder.found`
uses the same accessor.

## What this makes true

`PgActivityLogger` writes through the scope, so state and audit commit together — why the audit trail is
in Postgres, not the log stream.

The domain event rides the same scope: `PgOutboxPublisher` writes `outbox_event` through `this.db`, so
state and event commit together — a **transactional outbox**, relayed to the queue after commit.
Publishing to the queue *inside* the transaction holds it open across a network call and reintroduces
two-store atomicity; the drain did until `CP4.2`, and now claims with a lease and relays with nothing open.

## The test is the only proof

The spec runs commit, rollback, nesting and savepoint against the local stack:

```ts
await expect(
  uow.run(async () => {
    await logger.record(actor, action, { probe: true });
    throw new Error("boom");
  }),
).rejects.toThrow("boom");

const found = await database.client
  .select({ action: activityLog.action })
  .from(activityLog)
  .where(eq(activityLog.action, action));

expect(found).toEqual([]);
```

**Test commit too** — a `run()` that always rolls back passes the rollback case.

## The query-count seam

`DatabaseConfig` takes an optional drizzle `logger` so "four queries" is an assertion:

```ts
counter.count = 0;
await repository.resolveFor(organizationId, userId);
expect(counter.count).toBe(4);
```

`resolveFor` is the hottest query; a lookup in the loop makes it 4 + N, invisible at ten users, fatal
at five thousand.

## The statement timeout is set here, not on the connection

With `statementTimeoutMs`, `run()` first issues `set local statement_timeout = <ms>` — worker 120 000,
web 30 000 (the role floor, so one wasted round trip per transaction).

**`SET LOCAL`, never `SET`** — why the knob is here, not on the pool. A startup `statement_timeout` works
on a direct connection,
but through a transaction pooler such as pgBouncer the parameter is dropped, and
`SHOW statement_timeout` reads `0`. Unlimited. Lite runs no pooler ([PgBouncer](../../../../docs/scale/pgbouncer.md)) but is written as if
it did: `0000_lite_baseline.sql` restores a floor with `ALTER ROLE`; `SET LOCAL` raises it and dies with
the transaction.

A plain `SET` is worse: transaction-mode pgBouncer runs no `server_reset_query`, so it leaks to every later
client (measured: one `7s`, then twenty-five fresh clients reading `7s`). **No session-level `SET`,
anywhere.** **A nested `run()` sets nothing** — `SET LOCAL` in a savepoint outlives a rollback to it.
The spec uses 25 s (pool), 90 s (inside `run()`), 25 s again — catching both a no-op and a leak.
