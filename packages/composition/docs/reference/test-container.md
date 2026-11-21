---
title: Test container
description: The twenty-two fakes and the harness that wires them — why it returns abstract types, why it lives in src/ rather than tests/, and why query counts belong in the integration tier instead.
---

# `TestContainer`

The reason `Container` has this shape.

```ts
const activity = new RecordingActivityLogger();
const harness = TestContainer.build({ activity });

await new ReactivateTaskUseCase(tasks, harness.authorizer, activity, harness.clock)
  .execute(principal, { taskId });

expect(activity.actions()).toEqual(["task.reactivated"]);
```

No Postgres, Redis, S3, Better Auth or HTTP: every use-case test builds a `Principal` with a hand-made
`CapabilitySet` and asserts on behaviour. Integration tests are left for adapters and auth routes — a
smaller, less flaky set.

## Why it lives in `src/`, not `tests/`

It is not a test but a **compile-time completeness check**, which `tsc` can only see inside `src/`.
`TestPorts` has one entry per abstract class in `packages/application/src/port/` (twenty-one) plus
`content` (a `ContentSource`, from a package left of `application`) — twenty-two. A new port stops this
file compiling until it has a double, and a spec counts the directory too, catching what the type would
not force. That is the claim — *a new port shows up here as one line, not as compile errors in forty
specs* — and it holds only because the check is `tsc`'s.

## The barrel exports it, with no second entrypoint

`TestContainer`, `TestPorts`, `TestHarness`, `FixedClock` and the fakes come from `src/index.ts` beside
`Container`. When they were package-internal, consumers (`apps/worker` first) hand-rolled object
literals cast `as unknown as Container` — silent about next week's port, the failure `TestPorts` makes
loud. No subpath export ([Imports](../../../../docs/opinions/imports.md)).

**It reaches `dist/index.js` but neither web bundle** — `tsup` emits ESM, so consumers importing only
`Container` shake the rest out. Check after touching the barrel:

```bash
pnpm --filter @loadbearing/web build
grep -rl "InMemoryVectorStore\|TestContainer" apps/web/.output/   # nothing
```

**`packages/application` cannot use it** — `composition` imports `application`, so the reverse edge
would be a cycle. Its specs keep hand-rolled doubles; moving the fakes into a package left of
`application` would fix that, as a package decision.

## `build()` returns abstract types, on purpose

Like `Container` ([rule 1](container.md)), `TestHarness` annotates ports abstractly, so
`harness.activity.recorded()` does not compile. A spec asserting on a fake should **own the reference**
— construct it, pass it as an override, keep it:

```ts
const queue = new RecordingQueuePublisher();
const harness = TestContainer.build({ queue });
// …
expect(queue.publishedTo(QueueName.EMBEDDING)).toHaveLength(1);
```

## A fake for every port

| Port | Fake | Behaviour |
| --- | --- | --- |
| `CacheStore` | `InMemoryCacheStore` | Map + recorded TTLs, **never enforced** — wall-clock expiry is how a suite goes flaky |
| `StorageGateway` | `InMemoryStorageGateway` | bytes in a Map; `presign*` returns a fake URL rather than throwing |
| `QueuePublisher` | `RecordingQueuePublisher` | records, and honours `jobId` dedup because that is a domain rule |
| `MailPublisher` | `RecordingMailPublisher` | records, and honours `dedupeKey` for the same reason — it *becomes* the job id |
| `MailRenderer` | `StubMailRenderer` | canned subject and both parts; rendered copy is `content`'s suite to assert |
| `VectorStore` | `InMemoryVectorStore` | **real cosine**, goal filter applied to the input set |
| `EmbeddingProvider` | `StubEmbeddingProvider` | deterministic character histogram, no network |
| `SessionResolver` | `StubSessionResolver` | `null` by default; a use-case test never reaches it |
| `ActivityLogger` | `RecordingActivityLogger` | records actor, action and payload |
| `UnitOfWork` | `DirectUnitOfWork` | runs the work, opens nothing, counts the call |
| `ContentSource` | `StaticContentSource` | **the real one** — its catalog is a map of dynamic imports |
| `RealtimePublisher` | `RecordingRealtimePublisher` | records, and publishes into an `InMemoryRealtimeHub` when given one |
| `RealtimeSubscriber` | `InMemoryRealtimeSubscriber` | an unbounded async generator over the hub, ending on the signal |

Fakes stay minimal so a new port is **one line**; one needing its own tests defeats that. Exceptions:

- **`InMemoryVectorStore` computes real cosine** — identical scores would let "the top result is the
  right one" pass either way, the one assertion worth testing.
- **`RecordingQueuePublisher` models `jobId` dedup** — "enqueue OCR once" is the use-case's business
  rule, not queue config.
- **The realtime pair is not wired together by default:** the publisher gets no hub, the subscriber a
  private one, since most specs ask only *what was published*. A spec asserting a frame *arrived* builds
  one `InMemoryRealtimeHub` and passes both over it (`tests/fake/realtime-fake.spec.ts`).
- **`InMemoryRealtimeSubscriber` is unbounded**, unlike the Redis adapter — the bounded queue and
  `resync` marker protect process memory from a slow tab; modelling them would reimplement the thing
  under test.

## Every fake has a real counterpart

`Container` builds an implementation for every port, so each fake is a *double*. That once broke:
`EventBus` was faked here and bound nowhere, so a publishing use-case published into a fake under test
and into nothing in production. It was deleted; the outbox design came later with its adapter, which is
why `RecordingDomainEventPublisher` fakes something real. Guard this — a fake is cheap and an adapter is
not, so an unbound faked port reads as working until it runs.

## No `auth`, `sessions` or `principals`

`TestHarness` carries every port plus `clock`, `logger` and `authorizer`, not `AuthInstance`,
`CapabilityCache` or `PrincipalBuilder` — a use-case test never authenticates. Authentication is
asserted against Better Auth in the integration tier.

## Query counts belong in the integration tier

A fake cannot show `resolveFor` becoming 3 + N queries; only a real adapter on a real database can.
`DatabaseConfig.logger` is the seam, and the assertion lives beside the repository in
`packages/infrastructure` ([`infrastructure/docs`](../../../infrastructure/docs/index.md)) — the reason
the integration tier exists, rather than being a slower unit tier.
