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

- **No `script-src`** — Start inlines hydration scripts, so a policy without a nonce blanks every page.
  Today rendering docs Markdown through `rehype-sanitize` is the script barrier; a nonce `script-src` needs
  Start to pass the nonce to its own scripts.
- **HSTS only over https** — ignored over http, and would pin a dev host for a year once it gains a
  certificate. No `includeSubDomains`, which would bind hosts this app does not own.
- Redirect and fetched-response headers are immutable, so `SecurityHeaders.apply` copies the response
  around the same body. The realtime stream (`apps/realtime`, its own origin) does not pass through here.

## Server functions refuse a cross-site call

The same file registers Start's `createCsrfMiddleware` for server functions: a foreign `Sec-Fetch-Site`,
`Origin` or `Referer` gets a 403 (all server functions read today; this precedes the first writer).
`/api/*` is excluded — oRPC and Better Auth check `AUTH_TRUSTED_ORIGINS`, which the desktop shell needs.
