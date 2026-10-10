---
title: Security headers
description: The headers every web response carries, why the content security policy stops short of scripts, and why HSTS waits for https.
---

# Security headers

`src/start.ts` registers one request middleware, and it runs on every response the web server
sends: pages, server functions and every `/api/*` route. It adds what `SecurityHeaders` names and
keeps any header a route already set, so a route can still say otherwise (`FC.13`).

| Header | Value | Why |
|---|---|---|
| `content-security-policy` | `frame-ancestors 'none'; base-uri 'self'; object-src 'none'` | No page is framed, a `<base>` cannot redirect relative links, and no plugin content loads |
| `x-frame-options` | `DENY` | The same as `frame-ancestors`, for browsers that predate it |
| `x-content-type-options` | `nosniff` | An upload served as one type is never run as another |
| `referrer-policy` | `strict-origin-when-cross-origin` | Another site sees the origin, never a doc's path or a token in a query |
| `strict-transport-security` | `max-age=31536000` | Only when `AUTH_URL` is `https` |

**The policy sets no `script-src`.** Start inlines its hydration scripts, and a policy that does not
allow them with a nonce leaves every page blank. Docs Markdown goes through `rehype-sanitize` when
it is rendered, which is what stands between a page and a script today. A nonce-based `script-src` is the
next step, and it needs Start to hand the nonce to its own inline scripts.

**HSTS is sent only over https.** Over http a browser ignores it, and a dev host that later gains a
certificate would be pinned to https for a year. `includeSubDomains` is left off, because it would
bind hosts this app does not own.

A redirect's headers, and those of a fetched response, cannot be changed in place, so
`SecurityHeaders.apply` copies such a response around the same body.

The realtime stream is served by `apps/realtime` on its own origin and does not pass through here.
