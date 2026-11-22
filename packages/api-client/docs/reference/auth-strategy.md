---
title: Auth strategy
description: Why the credential seam is an abstract class rather than a config flag, why bearer omits the cookie, and the two-method TokenProvider contract the desktop app depends on.
---

# `AuthStrategy`, `TokenProvider`

```ts
export abstract class AuthStrategy {
  public abstract headers(): Promise<Record<string, string>>;
  public abstract get credentials(): RequestCredentials;
}
```

Two members — the whole difference between web and desktop clients.

## Why a class and not a flag

A `{ useBearer: true }` flag names *which of two hosts we thought of*; a class says *how this host
proves identity*, so a third (a CLI service token, a test session, a mobile shell) needs no `ApiClient`
change. One object also owns `credentials` and `headers()` together, making "bearer token plus cookie"
unrepresentable.

## `credentials: "omit"` is a security decision

| | `CookieAuthStrategy` | `BearerAuthStrategy` |
| --- | --- | --- |
| `credentials` | `include` | **`omit`** |

A Tauri webview serves from `tauri://localhost` (`http://tauri.localhost` on Windows), so the API's
cookie is never sent — why the bearer path exists. `omit` goes further, attaching **no** cookie to **any**
origin, so a desktop shell never hands a third party a session cookie.

## No token means no header, not an empty one

```ts
return token ? { authorization: `Bearer ${token}` } : {};
```

Not `Bearer null` or an empty `Bearer ` — an absent credential must look absent, or the log says
"invalid token" when the truth is "signed out" (the spec pins it). `headers()` re-reads the provider per
request, so `set(null)` signs out immediately without rebuilding the client.

## `TokenProvider` is two methods, and that is load-bearing

```ts
export abstract class TokenProvider {
  public abstract get(): Promise<string | null>;
  public abstract set(token: string | null): Promise<void>;
}
```

**Both async** because every real store is (an OS keychain via Tauri `invoke`, a mobile keychain, a
remote secret store); only the test double is not. **`set(null)` clears, so two methods:** a desktop
shell maps them onto Rust commands `get_session_token`, `set_session_token`, `clear_session_token`, and
`noImplicitOverride` makes a stale `token()`/`store()`/`clear()` triple a compile error.

> [!NOTE]
> **The token never touches `localStorage`** — injected script reads whatever script can. Behind an
> `invoke` boundary an XSS can ask once (a loggable event), not enumerate at leisure.

## `RequestCredentials` is restated, not imported

```ts
export type RequestCredentials = "omit" | "same-origin" | "include";
```

It is in `lib.dom`, which this Node-safe package does not load; three stable strings. Like
`SessionResolver`'s `RequestHeaders` ([`application`](../../../application/docs/index.md)) and `Uuid`'s
`crypto`: **name the shape locally rather than load a lib for one type** — structurally identical, so
`apps/web` passes the DOM type with no cast.
