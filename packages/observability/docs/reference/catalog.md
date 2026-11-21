---
title: catalog
description: Why a log line has a code, why the level lives in the catalog rather than the call site, and how sampling becomes a per-code dial.
---

# `EVENT_CATALOG` and `EventShape`

```ts
export interface EventMeta {
  readonly level: LogLevel;
  readonly sample?: number;
}

export const EVENT_CATALOG: { readonly [code: string]: EventMeta };
export type EventCode = keyof typeof EVENT_CATALOG;

export interface EventShape { readonly "queue.job.failed": { … } }
export type EventFields<C extends EventCode> = EventShape[C];
```

The catalog decides *policy* per code, the shape declares *payload*; adding an event is a line in each,
`content`'s two-file rhythm.

---

## The level is in the catalog, not the call site

```ts
log.emit("queue.job.failed", { queue, jobId, attempt });
```

No `log.error(...)`: the code carries its level, so one event cannot be `error` in the consumer and
`info` in the retry path (how level-based dashboards stop meaning anything), and changing a level is a
reviewable one-line diff in an owned table.

## Fields are declared per event

```ts
export interface EventShape {
  readonly "queue.job.failed": {
    readonly queue: string;
    readonly jobId: string;
    readonly attempt: number;
  };
}
```

- **A misspelling is a compile error** — `{ jobID }` fails, so a `jobId` dashboard keeps working.
- **Dashboard keys cannot drift** — the field list is declared, not whatever the first call site passed.
- **A token cannot be logged unless someone declared a field for it**, visibly in a diff — the primary,
  compile-time defence; `Redactor` is the runtime backstop for what a `child()` binding drags in.

> [!NOTE]
> `EventFields<C>` indexes `EventShape` by `EventCode`, so **an event without declared fields is a
> compile error** — the two files cannot drift.

## Sampling is per code

```ts
"http.request.completed": { level: "info", sample: 0.1 },
"http.request.failed":    { level: "warn" },
```

Per-request lines are the highest volume, and 10% shows a latency shift. **Failures are never sampled**
— a spec asserts no `warn` or `error` code has a rate. Sampling here, not at the sink, keeps the decision
beside its event and costs nothing for unsampled codes (no draw).

## Fragments, one per slice

```ts
export const EVENT_CATALOG = {
  ...coreEvents,
  // ...billingEvents,
} as const;
```

The team-ownership seam of `permissions/catalog/` and `errors/catalog/`: a slice adds
`<slice>.events.ts`, its `EventShape` entries, and one spread line.

## The grammar

`<subject>.<thing>.<state>`, past tense (`queue.job.failed`, `http.request.completed`,
`cache.entry.corrupt`, `dependency.request.failed`) — a log line records something that happened
([Vocabulary](../../../../docs/opinions/vocabulary.md)).

## Every code has an emitter

A declared code nothing emits is a dashboard panel empty forever — indistinguishable from health — so
every shipped code has a production call site (`check-architecture` asserts it), and codes describing
nothing the system does were deleted rather than wired:

| Deleted | Why |
|---|---|
| `queue.sweep.completed` | The recovery sweep has no file. Nothing publishes the kind of job it would re-enqueue |
| `db.query.slow` | No query timing exists. Slow-query detection is Postgres's own `log_min_duration_statement`, which is a deployment setting rather than an application line |
| `storage.upload.failed` | `S3StorageGateway` presigns and never uploads, so the failure it names happens in the browser |

- **`queue.job.failed` is emitted beside `logger.failure`**, deliberately: the event is the countable
  signal (queue health as a rate), the `error.raised` line the diagnosis (code, cause, stack) — a number
  you cannot explain versus an explanation you cannot alert on.
- **`http.request.completed`/`failed` come from `errorMiddleware`** inside the oRPC chain, and `path` is
  the **procedure** path — every RPC arrives at `/api/rpc`.

## `error.raised` is not in the catalog

The deliberate exception: `Logger.failure()` emits `error.raised` at a level from
`ERROR_CATALOG[code].severity` (`expected → warn`, `unexpected → error`) — the only line whose level the
logged thing decides, since the emitter cannot know in advance what it caught. See [logger](logger.md).
