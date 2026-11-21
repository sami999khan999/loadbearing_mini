---
title: Transport
description: Why ApiClient's constructor is private, what the loopback SSR request actually costs, and why the fetch override reaches globalThis instead of naming Request and Response.
---

# `ApiClient`

```ts
private constructor(private readonly rpc: AppClient) {}

public static overHttp(baseUrl: string, auth: AuthStrategy, streamUrl = baseUrl): ApiClient
public static inProcess(rpc: AppClient): ApiClient
```

**Streams go to `streamUrl`:** the link routes by the procedure's first segment — `realtime.*` (both
streams) to `streamUrl`, the rest to `baseUrl`. The web app passes `/api/realtime`, which Vite or the
proxy sends to the stream process, so the web app holds no open stream — one namespace, one process.

The constructor is private because **a URL is not always the right way to reach the server, and it is
wrong in the common case.**

## What the loopback SSR request costs

`overHttp("/api/rpc", …)` in an SSR loader calls its own process: serialise, socket to itself, inbound
HTTP stack, deserialise, and back — per query. Six loaders are six self-requests before a byte renders,
competing with real traffic, worst when busiest. `inProcess` calls the router client directly — same
middleware, `principalMiddleware` and `Authorizer.assert()`; **only serialisation is skipped**.

> [!IMPORTANT]
> A transport optimisation, never an authorization shortcut: `apps/web` passes the real
> `request.headers` in. Dropping them breaks auth or invites a hand-built privileged principal — which
> fails an audit, not a test.

## Both factories return the same type

`createQueryClient()` picks per environment:

```ts
transport: ApiClient.overHttp(Env.apiUrl, new CookieAuthStrategy())   // browser
transport: ApiClient.inProcess(createServerRpcClient(request))        // SSR
```

Nothing downstream can tell; on client navigation the same loader uses HTTP — provided the client
comes from the factory, not a module-scope singleton, which an SSR bundle shares across requests (the
bug of request state on the [`Container`](../../../composition/docs/reference/container.md)).

## The `fetch` override, and why it names nothing

```ts
type FetchLike = (input: unknown, init?: Record<string, unknown>) => Promise<never>;

const platformFetch = (): FetchLike => (globalThis as unknown as { fetch: FetchLike }).fetch;
```

It exists because `RPCLink` has a `headers` hook but cannot set `credentials`, a per-strategy choice;
the request passes through with one field added. `unknown` in, `never` out: naming `Request`/`Response`
needs `lib.dom`, which this package must not use, and `Promise<never>` fits whatever oRPC declares.
Reading `fetch` off `globalThis` is `Uuid`'s `crypto` and `JsonLogger`'s `console` pattern — one cast
beats a lib declaring `document` in a Node package.

## `raw`, and the accessors that replace it

```ts
public get raw(): AppClient {
  return this.rpc;
}
```

Namespaces graduate to two-line getters (`role` and `member` have; `public get task() { return
this.rpc.task; }` is the shape), giving a readable API and a home for per-namespace concerns (a retry
policy for a flaky upstream) without touching call sites.

## What the specs actually pin

`tests/client/api-client.spec.ts` stubs `globalThis.fetch`, captures the request and **rejects**
(a real response would test oRPC's wire format, not this package). It asserts the seam: cookie gives
`credentials: "include"` and no `authorization`; bearer gives `credentials: "omit"` and `Bearer abc123` —
"swapping strategies needs no other edit", made failable.
