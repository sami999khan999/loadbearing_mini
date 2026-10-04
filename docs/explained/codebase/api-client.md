---
title: API client
description: The typed API client and the sign-in client wrappers.
---

# API client

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

How the browser (or a future desktop app) talks to the server: the typed API client built from the contracts, and small wrappers around Better Auth's client for signing in and managing an account. On the server, the same client can call the API in-process, skipping the network during server rendering. No React.

| | |
|---|---|
| Folder | `packages/api-client/` |
| Files | 29 |
| Uses | [Contracts](contracts.md), [Errors](errors.md) |
| Used by | [Query (data fetching and caching)](query.md), [Feature (the screens' building blocks)](feature.md), [The web app](app-web.md) |

## Every file

### `packages/api-client/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/api-client/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/api-client/src/auth/`

| File | What it does |
|---|---|
| `account.client.ts` | `AccountClient`: account calls for a signed-in person through Better Auth: change name, email or password, turn two-factor on or off, link or unlink Google, list and end sessions. |
| `auth.client.ts` | `AuthClient`: calls for a signed-out visitor through Better Auth: sign up, sign in (including the two-factor step), sign out, forgotten password, verify email. Every failure becomes an `AppError`. |
| `auth.strategy.ts` | `AuthStrategy`: how a request proves who sent it. The browser uses a cookie and the desktop app a bearer token; this is the only difference between the two clients. |
| `bearer-auth.strategy.ts` | `BearerAuthStrategy`: adds `Authorization: Bearer <token>` from a token provider and never sends cookies. For the desktop app. |
| `better-auth-error-normalizer.ts` | `BetterAuthErrorNormalizer`: turns Better Auth's error replies into this app's error codes, so forms can branch on them. |
| `cookie-auth.strategy.ts` | `CookieAuthStrategy`: the browser's strategy: sends the session cookie with every request. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `organization.client.ts` | `OrganizationClient`: switch organization, create one, and accept an invitation, through the organization plugin's endpoints. |
| `token.provider.ts` | `TokenProvider`: where a desktop or mobile host stores the bearer token (`get` and `set`). |

### `packages/api-client/src/client/`

| File | What it does |
|---|---|
| `api-client.ts` | `ApiClient`: the typed client for the whole API, built from the shared contract, so calling a missing endpoint fails to compile. Live-stream calls go to the realtime app, everything else to the web app. On the server it can call in-process instead of over the network. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/api-client/tests/auth/`

| File | What it does |
|---|---|
| `account.client.spec.ts` | Tests `account.client.ts`. |
| `auth.client.spec.ts` | Tests `auth.client.ts`. |
| `auth.strategy.spec.ts` | Tests the cookie and bearer strategies, including that an absent token sends no header. |
| `better-auth-error-normalizer.spec.ts` | Tests `better-auth-error-normalizer.ts`. |
| `organization.client.spec.ts` | Tests `organization.client.ts`. |

### `packages/api-client/tests/client/`

| File | What it does |
|---|---|
| `api-client.spec.ts` | Tests `api-client.ts`. |

### `packages/api-client/docs/`

| File | What it does |
|---|---|
| `index.md` | How to reach the server — the typed oRPC client, the auth-strategy seam, and a transport that lets SSR skip the network entirely. React-free, and it has to stay that way. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/api-client/docs/reference/`

| File | What it does |
|---|---|
| `auth-strategy.md` | Why the credential seam is an abstract class rather than a config flag, why bearer omits the cookie, and the two-method TokenProvider contract the desktop app depends on. |
| `better-auth.md` | Why both clients throw instead of returning { data, error }, why a successful sign-in can be a failure, and the code-then-status table BetterAuthErrorNormalizer maps with. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `transport.md` | Why ApiClient's constructor is private, what the loopback SSR request actually costs, and why the fetch override reaches globalThis instead of naming Request and Response. |
