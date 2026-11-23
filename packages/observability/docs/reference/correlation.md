---
title: Correlation
description: One id per request, adopted from upstream where there is one, stamped onto the error envelope so a user can read it back.
---

# `Correlation`

```ts
export type TraceId = string;

export class Correlation {
  public static readonly HEADER = "x-request-id";
  public static sanitise(value: string | null | undefined): TraceId | null;
  public static mint(): TraceId;
  public static fromHeaders(headers: { get(name: string): string | null }): TraceId;
}
```

---

## Adopt upstream's id before minting your own

```ts
const traceId = Correlation.fromHeaders(request.headers);
```

A load balancer, CDN or proxy usually sets `x-request-id`; adopting it makes their access log and ours one
trace. Minting happens only when there is nothing to adopt.

## An adopted id is untrusted input

It rides **every line**, so it is capped at 128 characters and checked against `[\w.:-]+`, else
discarded and minted — otherwise a caller controls a log-injection string. **The rule lives in `errors`'
`TraceIds`** and `sanitise` delegates: `AppError.from()` rebuilds trace ids from network envelopes too,
and `observability` imports `errors`, never the reverse.

**`traceId` must never be a log label** — a label in a log store like Loki is one stream per value, so
one stream per request. It stays in the body, reached by `| json | traceId="…"` after the selector. Labels
are `app`, `env`, `level`, `event_code` only —
[Data and scale](../../../../docs/opinions/data-and-scale.md).

```ts
Correlation.sanitise("a b c");      // null — mint instead
Correlation.sanitise("<script>");   // null
Correlation.sanitise("a".repeat(500)).length;  // 128
```

## A plain string, not a branded id

Branding stops a `GoalId` posing as a `TaskId`; nothing is trace-shaped to confuse, and a proxy's id
arrives in its own shape — `contracts` deliberately owns no request/trace id. Minting uses `core`'s
`Uuid.v7()`, so ids sort by time.

## Where it is created

| Runtime | Where | Why there |
| --- | --- | --- |
| `apps/web` | a middleware **before** `principalMiddleware` | both entrypoints already pass raw `Headers`; nothing upstream changes |
| `apps/worker` | per job, next to `SystemPrincipal.forOrganization(...)` | the worker never runs oRPC middleware |

Either way it is bound onto a child logger at once.

## It reaches the user

The error interceptor stamps `ErrorEnvelope.traceId`, `AppError.from()` reads it back and
`TransportError` keeps it, so an error page shows a reference: a user hands over eight characters and the
exact line comes back. A thrown error carries none — the id belongs to the request, stamped by the
adapter that knows requests.

## What is not here yet

**Propagation across the queue** — an enqueuing request and its job are two traces. Joining needs a
`traceId` on `JobOptions` (a diagnostic in a domain port) or `AsyncLocalStorage` (Node-only, not
isomorphic). Undecided.
