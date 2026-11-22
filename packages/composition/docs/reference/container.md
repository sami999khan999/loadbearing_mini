---
title: Container
description: The four rules that govern the DI root — abstract types on the public surface, no request state, no process.env, reverse-order disposal — plus where use-cases go and why lazy instantiation is banned.
---

# `Container`

One class, no decorators, no reflection, no module graph. Four rules, each preventing a failure.

## 1. Ports are exposed as their abstract types

```ts
public readonly vectors: VectorStore;      // not PgVectorStore
```

A leaked concrete type invites Postgres-specific calls and ends the one-line swap. **The annotation
enforces it** — TypeScript would infer `PgVectorStore`. `capabilities: CapabilityCache` and
`principals: PrincipalBuilder` are concrete on purpose: they *are* the caching and credential-collapsing
decisions.

## 1b. Swappable ports are chosen by a `driver`, not by a `new`

```ts
this.vectors = Container.buildVectorStore(config, this.cluster, this.transactions, this.shards);
```

Rule 1 makes the *type* swappable; a `driver` makes the *choice* configurable. **A one-implementation
seam is untested by construction** — a discriminated `driver` on `ContainerConfig` is exercised by an
environment change alone. `buildVectorStore` switches with a `never` default, so an unhandled driver fails
the build; `VECTOR_DRIVER` has one value, written as a union on purpose.

### The embedding vendor is a `SearchMode`, not an optional field

```ts
this.searchMode = Container.buildSearchMode(config.embedding, this.logger);
```

`none` gives `{ kind: "lexical" }`; `openai`/`gemini` give `{ kind: "semantic", provider }`. **A tagged
value, not a maybe-missing provider** — callers must read `kind`, so "no key" is a compiler-forced branch;
the same `never`-defaulted `switch`. See
[`infrastructure/docs/reference/embedding.md`](../../../infrastructure/docs/reference/embedding.md).

## 2. Never build request-scoped state into the container

The `Principal` is an `execute()` argument. **One container per process, not per request** — request
state couples the root to a lifecycle and makes the worker and a NestJS move expensive. The one
`AsyncLocalStorage` is `TransactionScope`, where the alternative is a `tx` on every port method
([`infrastructure/docs/reference/unit-of-work.md`](../../../infrastructure/docs/reference/unit-of-work.md)).

## 3. Config arrives as a constructor argument

No `process.env` here or in any package (the apps' `env.ts` files are the boundary; Biome's
`noProcessEnv` holds it). **The logger's `app` and `env` are bound fields, not options:**

```ts
this.logger = new JsonLogger({
  level: config.logging.level,
  pretty: config.logging.pretty,
  bound: { app: config.logging.app, env: config.logging.env },
});
```

Spreading `config.logging` into `JsonLoggerOptions` would **compile** (no excess-property check on a
variable) and silently drop both — no label telling `web` from `worker`.

Binding them puts `app` and `env` on every line, which is what lets a log shipper read all four
labels from the body instead of orchestrator metadata that differs across Compose, Kubernetes and
`pnpm dev`.

> [!NOTE]
> **`logger` is a shared primitive, not a port** — beside `clock` and `authorizer`; the domain does not
> log ([`application/docs`](../../../application/docs/index.md)), and the seam lives in `observability`.

## 4. `dispose()` closes in reverse construction order

```ts
await this.queuePublisher.close();
await this.redis.close();
await this.emailSender.close();
await this.cluster.close();
```

Queues, then Redis, then Postgres — closing Redis under BullMQ's blocking connections is a real deadlock.

- **SMTP is held as `emailSender`, exposed as `email`** (like `queuePublisher`/`queue`): the port says
  nothing of lifetime, and an unclosed Nodemailer waits out every socket. It was once forgotten.
- **`RedisConnection.close()` quits both instances** — one object, so the queue (whose unclean close
  redelivers jobs) cannot be forgotten.
- **`cluster.close()` is the one Postgres close, last** — it owns every pool, node 0's included;
  closing those separately would double-close.
- **The logger is built first and disposed last** — a failed `Database` should log structurally, and
  everything closing may still log.

## `health()` pings what callers actually hold

```ts
const [database, cache, queue, realtime] = await Promise.all([
  this.cluster.isHealthy(),
  this.redis.healthy("cache"),
  this.redis.healthy("queue"),
  this.redis.opened("subscriber") ? this.redis.healthy("subscriber") : Promise.resolve(null),
]);

return {
  healthy: Object.values(database).every(Boolean) && cache && queue && realtime !== false,
  database, cache, queue,
  analytics: null,
  realtime,
  pool: this.database.stats(),
};
```

- **`database` is keyed by node** — `{ 0: true, 1: false }` says "page shard 1's owner", which a rolled-up
  `false` cannot. `pool` stays this process's node-0 pool (averaging shards would hide saturation).
  `ContainerHealthReader` folds it to a boolean for `PlatformHealth`.
- **Both Redis instances** — a down cache degrades, a down queue silently stops work; one says nothing
  of the other.
- **A breakdown, not a boolean** — a failing probe's body is what the operator reads at 3am.

**`analytics` is always `null`.** Lite runs no analytics store, and `null` means "not part of this
deployment" — not healthy, not degraded. The field stays so the status contract keeps its shape for
a kit that ports analytics back ([`docs/scale/analytics.md`](../../../../docs/scale/analytics.md)).

**The realtime subscriber is `null` until a stream opens** (every worker; a web replica before its first
tab): `opened("subscriber")` checks without **creating** it. Once open it is a real dependency —
`realtime !== false` — since a replica with a dead subscriber serves everything and delivers nothing.

**No log store is on this list.** Lite writes JSON to stdout and reads nothing back, so there is
nothing to ping. Whatever ships those lines stays off the probe even when you add one: a log
pipeline being down loses diagnostics and nothing else, and failing readiness over it takes the
application down to protect its logs — backwards during the incident where the logs matter most.
See [`docs/scale/logs.md`](../../../../docs/scale/logs.md).

`RedisConnection.healthy(role)` takes a role (keeping `ioredis` in `infrastructure`) and pings the
memoised connection actually in use.

## Enrolment mode is a binding, not a policy

```ts
private static enroller(mode, personal, bootstrap, claimer): MembershipEnroller
```

**The only line knowing which mode is which** — tenancy, the likeliest fork, resolved in the DI root.

| `AUTH_ENROLMENT_MODE` | Adapter | Posture |
|---|---|---|
| `personal` | `PgPersonalOrganizationEnroller` | The default: the only mode that works against an empty database, so a fresh clone can sign up and be signed in without `pnpm db:seed` having run |
| `bootstrap` | `PgBootstrapMembershipEnroller` | The demo and single-tenant posture |
| `invite` | `NullMembershipEnroller` | Production: the decorator is the only door, and an address nobody invited is refused a session by `MembershipReader` |

All are wrapped in `InvitationClaimingEnroller`, so invitations win before the mode
([enrolment](../../../auth/docs/reference/enrolment.md)). Everything gated on `config.auth` is skipped in
the worker.

## The one nominal binding in the repository

```ts
const membershipReader: MembershipReader = new PgMembershipReader(
  this.database,
  this.transactions,
);
```

`MembershipReader` is declared in `auth`, which depends on `infrastructure`, so `PgMembershipReader`
satisfies it **structurally** — this annotation is the only check (drop it and drift fails at sign-in).
`PgApiKeyRepository` → `ApiKeyRepository` is checked by the `ApiKeyResolver` constructor instead.

## Where use-cases go

Fifty use-case fields is unwieldy but honest, and simpler than a module graph. Group by slice:

```ts
public readonly task: TaskUseCases;

// …
this.task = this.buildTaskUseCases();

private buildTaskUseCases(): TaskUseCases {
  const tasks = new PgTaskRepository(this.database, this.transactions);
  return {
    create: new CreateTaskUseCase(tasks, this.authorizer, this.activity),
    reactivate: new ReactivateTaskUseCase(tasks, this.authorizer, this.activity, this.clock),
  };
}
```

Routers read `context.container.task.reactivate.execute(...)`, mirroring the contract path. **No lazy
getters** — eager construction makes a wiring mistake a **startup crash**, not a 3am request failure.

## `ContainerHealthReader` is the one place the container implements a port

The platform status use-case reports what `health()` answers, and `application` cannot name this
package — so the seam is forced:

```ts
this.platformAdmin = {
  inspectStatus: new InspectPlatformStatusUseCase(
    this.authorizer,
    this.platform,
    new ContainerHealthReader(this),
  ),
};
```

It is the constructor's **last** block, and `report()` runs per request — nothing is deferred but the
call, so it is not lazy instantiation. `PlatformHealth` drops `pool` (one process's gauge).

## The mail block is outside the `auth` branch, and that was a bug

The mailers once lived inside `if (config.auth)`, so the worker — the sender — had none. Now
`mailPublisher`, `mailRenderer` and `mail.send` are unconditional:

```ts
this.mailPublisher = new QueuedMailPublisher(this.queue);
this.mailRenderer = new ContentMailRenderer(this.content);
this.mail = { send: new SendMailUseCase(this.mailRenderer, this.email) };
```

`mailPublisher` is public (the notification subscriber holds one); `mailRenderer` is private, so only
`mail.send` decides what a message looks like. `QueuedAuthMailer` (→ `AuthFactory`) and
`QueuedInvitationMailer` (→ `InviteMemberUseCase`) stay in the `auth` branch but take a `MailPublisher`,
rendering nothing; the invitation origin is `config.email.baseUrl`, not `config.auth.baseUrl`.

## Smells

- The word `if` anywhere except reading a config flag — logic has crept in.
- A concrete class name in a public field's type annotation.
- A getter. See above.
- A field holding a `Principal`, a `Request`, or anything else that belongs to one request.
