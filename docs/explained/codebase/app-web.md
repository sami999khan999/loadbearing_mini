---
title: The web app
description: The website and API server: every page, the API, sign-in and the public docs.
---

# The web app

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The website and API server, built with TanStack Start (React, rendered on the server). It serves every page, the API at `/api/rpc`, sign-in at `/api/auth`, the public docs, `/llms.txt`, doc images and the health check.

`src/route/` holds the pages, one file per URL (folders in brackets group files without adding to the URL; a `-` prefix means "not a page"). `src/server/` is the only place allowed to touch server code: the container, the API routers and server functions. In production it runs one process per CPU core (`cluster.mjs`).

| | |
|---|---|
| Folder | `apps/web/` |
| Files | 109 |
| Uses | [API client](api-client.md), [API server](api-server.md), [Application (the business logic)](application.md), [Composition (the wiring)](composition.md), [Content](content.md), [Contracts](contracts.md), [Errors](errors.md), [Feature (the screens' building blocks)](feature.md), [Observability](observability.md), [Permissions](permissions.md), [Query (data fetching and caching)](query.md), [UI (the design system)](ui.md) |
| Used by | nothing; it is a top-level program |

## Every file

### `apps/web/`

| File | What it does |
|---|---|
| `cluster.mjs` | Starts one web server process per CPU core and replaces any that crash, giving each a window to finish requests on shutdown. Gives up if processes keep dying on start. |
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `vite.config.ts` | The Vite build settings: TanStack Start, React, Tailwind, the port, sending `/api/realtime` to the realtime app in development, and resolving workspace packages to their source. |
| `vitest.config.ts` | Test runner settings for the web app, with a complete fake environment so `Env` can load. |
| `vitest.smoke.config.ts` | Settings for the web smoke tests, run serially against a booted app and Mailpit. |
| `web.d.ts` | Tells TypeScript that importing image and font files gives a URL string. |

### `apps/web/src/`

| File | What it does |
|---|---|
| `endpoint.ts` | `Endpoint`: the two URLs the browser calls: `/api/rpc` for the API and `/api/realtime` for live streams, both on the same origin. |
| `env.ts` | `Env`: reads and validates every environment variable the web app needs, once, at start-up. A missing or wrong value stops the app from starting. One of only two files allowed to read `process.env`. |
| `import.ts` | Every outside import the browser-safe part of the web app uses, written once. Must never name server-only packages. |
| `router.tsx` | `getRouter`: builds the TanStack router for each request, with a fresh query cache, session, text and appearance, and sends what the server already loaded to the browser so nothing is fetched twice. |

### `apps/web/src/route/`

| File | What it does |
|---|---|
| `-boundary.tsx` | `ErrorBoundary`, `NotFound` and `Pending`: what a page shows when it fails, is not found, or is loading. Not a route (the `-` prefix). |
| `-context.ts` | `RouterContext`: what every route can reach (query cache, API client, session, text, menu content), built per request. |
| `-doc-link.tsx` | `DocLink`: turns the plain links the docs components produce into router links, so clicks navigate without a page reload. Outside links open safely. |
| `-doc-reader.tsx` | `DocReaderRoute`: the shared wrapper for both docs readers: applies the space's theme (or the reader's choice) to the reader only, and reads the page HTML back from the server's markup. |
| `-guard.ts` | `RouteGuard`: page-level checks: `requireSession` sends signed-out visitors to sign in (with a way back), `requirePermission` sends people without a permission to `/forbidden`. A convenience; the server checks again. |
| `-locale.tsx` | `LocaleSwitcher`: the language picker. Saves the choice in a cookie and reloads the text. |
| `-messages.ts` | Lets a route declare which text namespaces its pages need. |
| `-redirect.ts` | `RedirectSearch`: checks the `?redirect=` value on sign-in so it can only point inside this site. |
| `-session.ts` | `refreshSession` and `completeSignIn`: what every page does after the session changes (sign in, switch organization): clear the cache and reload. |
| `__root.tsx` | The root of every page: the HTML shell, the stylesheet, the theme set before first paint, the session and text loaded once, and the providers every page uses. |
| `llms[.]txt.ts` | `/llms.txt`: a list of every public doc page with a link to its Markdown, for AI agents. |

### `apps/web/src/route/(app)/`

| File | What it does |
|---|---|
| `_authenticated.tsx` | The layout for every signed-in page: requires a session, then draws the header (menu, organization switcher, bell, account menu). |

### `apps/web/src/route/(app)/_authenticated/`

| File | What it does |
|---|---|
| `dashboard.tsx` | The `/dashboard` page after sign-in: a welcome and the dashboard cards. |
| `documents.tsx` | The `/documents` page: AI document search, and indexing for those allowed. |
| `notifications.tsx` | The `/notifications` page: the full inbox. |
| `platform.tsx` | The layout for the super admin pages: the platform menu beside the page. |

### `apps/web/src/route/(app)/_authenticated/organization/`

| File | What it does |
|---|---|
| `new.tsx` | The `/organization/new` page: found a new organization. |

### `apps/web/src/route/(app)/_authenticated/platform/`

| File | What it does |
|---|---|
| `accounts.tsx` | The `/platform/accounts` page: find, suspend and reinstate accounts, platform denies, and (in the small kit) tenant export and delete. |
| `entitlements.tsx` | The `/platform/entitlements` page: plans, and one organization's plan and adjustments. |
| `flags.tsx` | The `/platform/flags` page: feature flags and their targets. |
| `index.tsx` | `/platform` itself: forwards to the first platform page the reader may open. |
| `status.tsx` | The `/platform/status` page: system health, module kill switches and the replica switch. |

### `apps/web/src/route/(app)/_authenticated/settings/`

| File | What it does |
|---|---|
| `account.tsx` | The `/settings/account` page: profile and email. |
| `api-keys.tsx` | The `/settings/api-keys` page: list, create and revoke API keys. |
| `index.tsx` | `/settings` itself: forwards to the first settings page. |
| `members.tsx` | The `/settings/members` page: members, invitations and the invite form, and one member's access panel. |
| `notifications.tsx` | The `/settings/notifications` page: notification preferences. |
| `roles.tsx` | The `/settings/roles` page: roles, the permission grid and creating a role. |
| `security.tsx` | The `/settings/security` page: password, two-factor, linked accounts and active sessions. |

### `apps/web/src/route/(app)/doc/`

| File | What it does |
|---|---|
| `index.tsx` | `/doc`: the organization's doc spaces as cards. |
| `route.tsx` | The layout for `/doc`: a full-height docs screen without the app header, still behind sign-in. |

### `apps/web/src/route/(app)/doc/$space/`

| File | What it does |
|---|---|
| `$.tsx` | One page of the organization's own docs, at `/doc/<space>/<page path>`. |

### `apps/web/src/route/(app)/doc/manage/`

| File | What it does |
|---|---|
| `index.tsx` | `/doc/manage`: every space with its settings, grants (for the platform's own spaces) and a way into its pages. |

### `apps/web/src/route/(app)/doc/manage/$spaceId/`

| File | What it does |
|---|---|
| `$pageId.tsx` | The page editor, beside its revision history. |
| `index.tsx` | One space's page tree in the editor. |

### `apps/web/src/route/(dev)/`

| File | What it does |
|---|---|
| `kitchen-sink.tsx` | A developer page that shows every UI component in every theme, to spot unreadable colours. Not available in production builds. |

### `apps/web/src/route/(shell)/`

| File | What it does |
|---|---|
| `forbidden.tsx` | The `/forbidden` page shown when a signed-in person lacks a permission. |
| `forgot-password.tsx` | The `/forgot-password` page. |
| `index.tsx` | The home page for signed-out visitors. Signed-in visitors are sent to the dashboard. |
| `reset-password.tsx` | The `/reset-password` page, reached from the reset email. |
| `sign-in.tsx` | The `/sign-in` page, including the two-factor step and the redirect back afterwards. |
| `sign-up.tsx` | The `/sign-up` page, with Google first when configured, then the email form. |
| `verify-email.tsx` | The page the email verification link lands on: verified, or why not. |

### `apps/web/src/route/(shell)/docs/`

| File | What it does |
|---|---|
| `-cache.ts` | `DocCacheHeaders`: the cache headers for public docs pages: shared only when the visitor sent no cookie, fresh for a minute, then stale while one request refreshes it. |
| `index.tsx` | `/docs`: the platform's public spaces, and granted ones the reader may open, as cards. Needs no sign-in. |

### `apps/web/src/route/(shell)/docs/$space/`

| File | What it does |
|---|---|
| `$.tsx` | One page of the platform's public or granted docs, at `/docs/<space>/<page path>`. Works signed out, with caching headers for shared caches. |

### `apps/web/src/route/(shell)/invitation/`

| File | What it does |
|---|---|
| `$token.tsx` | Where an invitation link lands: shows who invited you to what, and lets you sign in, sign up or accept. |

### `apps/web/src/route/api/`

| File | What it does |
|---|---|
| `health.ts` | `/api/health`: the readiness check. Answers 503 while a database, Redis or the bucket is unreachable. |

### `apps/web/src/route/api/auth/`

| File | What it does |
|---|---|
| `$.ts` | Mounts Better Auth at `/api/auth/*` (sign-in, sign-up, sessions, organization switch and so on), with CORS for the desktop app. |

### `apps/web/src/route/api/doc/`

| File | What it does |
|---|---|
| `$.ts` | `/api/doc/<space>/<path>`: a public page's Markdown source, for "Open in ChatGPT / Claude" and AI agents. |

### `apps/web/src/route/api/doc-image/`

| File | What it does |
|---|---|
| `$.ts` | `/api/doc-image/...`: serves a doc image to whoever may read its page, by redirecting to a short-lived signed storage URL. |

### `apps/web/src/route/api/doc-nav/`

| File | What it does |
|---|---|
| `$.ts` | `/api/doc-nav/<space>?v=<version>`: a platform space's full sidebar, cached forever per version for signed-out readers. |

### `apps/web/src/route/api/rpc/`

| File | What it does |
|---|---|
| `$.ts` | Mounts the API at `/api/rpc/*`. |

### `apps/web/src/server/`

| File | What it does |
|---|---|
| `appearance.fn.ts` | Server function: reads the theme, light/dark, font and language from cookies and browser hints, so the first painted page already looks right. |
| `container.ts` | Builds the one `Container` for the web process (kept across hot reloads) and disposes it on shutdown. |
| `cors.ts` | `Cors`: adds CORS headers for allowed origins only (the desktop app is a different origin), never reflecting an unknown one. |
| `doc.fn.ts` | Server functions for the public docs: read a platform page, list platform spaces, search platform docs. Works signed out. |
| `import.ts` | The only place in the web app allowed to import server-only packages (the container, the routers). Kept separate so server code cannot leak into browser bundles. |
| `invitation.fn.ts` | Server function: what an invitation link shows before anyone signs in. |
| `rpc-client.ts` | `createServerRpcClient`: an API client for server rendering that calls the routers in-process, with the real request's headers. |
| `rpc-transport.ts` | `serverTransport`: the in-process transport used by that client. |
| `session.fn.ts` | Server function: who is signed in, their organizations, active organization, permissions and flags, and whether Google sign-in is on. Loaded once per page. |

### `apps/web/src/server/orpc/`

| File | What it does |
|---|---|
| `api-key.router.ts` | Connects the API key endpoints to their use-cases. |
| `app.router.ts` | The whole API router, merged from each area's router. Must match the shared contract exactly or it fails to compile. |
| `doc-grant.router.ts` | Connects the doc grant endpoints to their use-cases. |
| `doc-page.router.ts` | Connects the doc page endpoints to their use-cases. |
| `doc-space.router.ts` | Connects the doc space endpoints to their use-cases. |
| `document.router.ts` | Connects the document (AI search) endpoints to their use-cases. |
| `handler.ts` | The one oRPC request handler for the process, with stream keep-alives. |
| `member.router.ts` | Connects the member endpoints to their use-cases. |
| `notification.router.ts` | Connects the notification endpoints to their use-cases. |
| `override.router.ts` | Connects the override endpoints to their use-cases. |
| `platform.router.ts` | Connects every super admin endpoint to its use-case. |
| `role.router.ts` | Connects the role endpoints to their use-cases. Each endpoint is three lines with no logic. |

### `apps/web/src/store/`

| File | What it does |
|---|---|
| `appearance.store.ts` | `AppearanceStore`: the current theme, light/dark, font and language, decided on the server and carried into the browser. |
| `article-html.store.ts` | `ArticleHtmlStore`: keeps a doc page's HTML out of the data sent to the browser (it is already in the page) and reads it back from the page instead. |
| `session.store.ts` | `SessionStore`: the session snapshot carried from server to browser, including permissions and whether the active organization is the platform one. |

### `apps/web/src/style/`

| File | What it does |
|---|---|
| `app.css` | The web app's stylesheet entry: pulls in the UI package's styles and tells Tailwind which files to scan. |

### `apps/web/tests/`

| File | What it does |
|---|---|
| `endpoint.spec.ts` | Tests `endpoint.ts`. |

### `apps/web/tests/route/`

| File | What it does |
|---|---|
| `guard.spec.ts` | Tests `-guard.ts`: signed-out visitors go to sign-in with a safe way back, and people without a permission go to `/forbidden`. |
| `kitchen-sink.spec.ts` | Tests that the kitchen-sink developer page is refused in a production build. |
| `redirect.spec.ts` | Tests `-redirect.ts`: a sign-in redirect can never point to another site. |
| `routes.spec.ts` | Tests that every route file maps to a path declared in the shared route table. |

### `apps/web/tests/server/`

| File | What it does |
|---|---|
| `cors.spec.ts` | Tests `cors.ts`. |
| `realtime.stream.spec.ts` | Tests that the live stream keeps its database placement and error handling for every frame. |

### `apps/web/tests/smoke/`

| File | What it does |
|---|---|
| `stream.smoke.spec.ts` | Smoke test against a running app: sign up, open a live stream, and receive a message caused by another request. |

### `apps/web/tests/smoke/support/`

| File | What it does |
|---|---|
| `server.ts` | Starts the built web app for the smoke tests and cleans up the accounts they created. |
| `stack.ts` | The smoke run's connection details. |

### `apps/web/tests/store/`

| File | What it does |
|---|---|
| `appearance.store.spec.ts` | Tests `appearance.store.ts`. |
| `article-html.store.spec.ts` | Tests `article-html.store.ts`. |
| `session.store.spec.ts` | Tests `session.store.ts`. |

### `apps/web/docs/`

| File | What it does |
|---|---|
| `index.md` | The TanStack Start application. Thin, deletable and framework-shaped — every decision it makes is about the seam between a browser and the server graph, and no business logic lives here. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `apps/web/docs/reference/`

| File | What it does |
|---|---|
| `enforcement-surfaces.md` | The four places a permission is checked, in order of authority — and why the three weaker ones are worth having even though only the first one is the gate. |
| `env.md` | Why the schema parses eagerly, the two cross-field rules that earn their exception, why Endpoint is a separate file, and why the auth base URL ends in .invalid. |
| `import-surfaces.md` | Why this app has two import.ts files rather than one, what each may name, and the three imports that are deliberately outside both because a tool demands it. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `server-functions.md` | Why a *.fn.ts is half client, what that means for what it may import, and why the four shipped ones resolve state and leave every decision to a use-case. |
