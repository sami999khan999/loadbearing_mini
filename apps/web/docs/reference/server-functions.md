---
title: Server functions
description: Why a *.fn.ts is half client, what that means for what it may import, and why the four shipped ones resolve state and leave every decision to a use-case.
---

# Server functions

`session.fn.ts`, `appearance.fn.ts`, `invitation.fn.ts`, `doc.fn.ts` — plus `rpc-client.ts` and
`container.ts`, which share their constraints.

## A server function is half client

**The stub ships to the browser; only the handler body is stripped.** So `session.fn.ts` is a client-graph
edge — importing `src/server/import.ts` there put `@tanstack/react-start/server` one hop from
`__root.tsx`, and import protection denied the build. The `*.fn.ts` files take:

- `~/import.ts` — the **client** surface;
- `@tanstack/react-start` and `@tanstack/react-start/server` **directly**, because a re-exported
  `/server` entry is exactly the edge that gets denied;
- `./container.js` as a **relative import inside the handler body**, where the compiler removes it.

See [`import-surfaces.md`](./import-surfaces.md).

## They resolve state and decide nothing

No business logic, no authorization decision — just state, so the first rendered byte is correct.

**`fetchSession`** resolves who is asking and what they may do — **not** via `PrincipalBuilder` (the
authorization path, which accepts `x-api-key` first; a key has no name to render). It reads the same
`CapabilityCache` (`organization:user`), so client `can()` and server `assert()` share one set; the
switcher's membership list rides along in one indexed query. **A shell rendering a user the server would
refuse is worse than rendering nobody**: no `activeOrganizationId` (as `BetterAuthSessionResolver`) or a
**deactivated membership** (once missed — every call then answered `UNAUTHORIZED`, the stream reconnecting
forever) means no session; the check shares the capabilities' `Promise.all`.

**Flags ride the same `Promise.all`** (`container.flags.onFor(organization)`, one deployment-wide key),
filtered through
`FlagRegistry.isClientGating` **on the server**, and only a flag marked as gating the client reaches
the snapshot. A server-only flag's name never leaves the server. Lite's `FLAGS` is empty, so today
the list is always empty; the filter is there for the first flag you add.

Client-gating names are in the bundle anyway: **a flag is the wrong tool for a secret**.

**`fetchAppearance`** paints the right colour first: a server-readable cookie beats a client-only
preference. `Sec-CH-Prefers-Color-Scheme` comes only after `Accept-CH`, so absence means light; the inline
script in `__root.tsx` covers the rest.

**`fetchInvitation`** takes no principal (the holder may have no account) and returns
`InvitationClaimer.preview`'s three fields, restated to keep the server graph out of the route; the claim
runs through the auth endpoint.

**`fetchPlatformDocReading`/`fetchPlatformDocSpaces`** serve platform docs to anyone, resolving the
viewer via `PrincipalBuilder` because `granted` spaces depend on who asks; `ReadPlatformDocUseCase`
decides, and an unreadable space is the same `null` as a missing one. They are the one request placed
without a principal of the organization read: `container.placedAt(platformOrganization, …)`
([`doc.md`](../../../../packages/application/docs/reference/doc.md)). Each returns `cacheable` (no cookie,
no credential), which the route's `headers` turns into `public, s-maxage=60` or `private, no-store` — the
root serialises the session into every page, so only pages rendered for nobody may be shared.

## `container.ts`: one per process, at module scope

> [!CAUTION]
> Never per request — a pool per request exhausts Postgres in about four seconds under load. Count pools
> **across replicas**: forty instances × ten is four hundred against a default `max_connections` of 100.

## `rpc-client.ts`: in-process, with the real headers

An HTTP client during SSR would loop back through serialisation twice per loader. **Pass the real
request headers** — `principalMiddleware` resolves from them; skipping them breaks auth or invites a
hand-built privileged principal. In-process skips serialisation, nothing else.

## Streams: one procedure that is not a request

`realtime.stream` is an oRPC event iterator (`async function*`, output
`eventIterator(RealtimeContract.message)`) served by `apps/realtime` as `text/event-stream` on
`/api/realtime`. The web app's `/api/rpc` does not mount `realtime`; `rpc-client.ts` adds it only to fit
`AppClient`, and SSR never opens a stream.

- **It is a POST**, whatever `.route()` says — `RPCHandler` dispatches on the procedure path
  (`/api/realtime/realtime/stream`); `curl -N` on the contract's `GET` finds nothing, and
  `StrictGetMethodPlugin` is on.
- **The channel comes from the principal only** —
  `RealtimeChannels.user(principal.organizationId, principal.userId)`, no input. Hence
  `core.realtime.subscribe`, held by every principal: each frame was authorised where produced.

- **A resume replays**, or yields `resync` when the log no longer reaches back (`26.5`): `lastEventId`
  becomes the subscriber's `after`. Frames go out via `withEventMeta({ id, retry })` — `id` returns as
  `Last-Event-ID`, `retry` feeds `ClientRetryPlugin`.

- **Keep-alive is 15 s** (oRPC's default 5), set in the realtime listener — inside proxy idle timeouts,
  a third of the traffic. The default initial comment flushes headers, so dev proxies connect at once.
- **`http.request.completed` fires at stream *start*** (`errorMiddleware` wraps the iterator's creation),
  so `durationMs` is time-to-open; per-frame lines would be the volume mistake. Cost is on
  `realtime.stream.closed`: duration and frame count, once.

> [!IMPORTANT]
> **Never re-export oRPC's `EventPublisher`** from `apps/web/src/server/import.ts` — in-process fan-out
> works on one replica and silently misses the rest.

> [!NOTE]
> **HTTP/1.1 allows six connections per origin** and a stream holds one per tab — hence exactly **one**
> stream, in the `_authenticated` layout. HTTP/2 removes the limit.
