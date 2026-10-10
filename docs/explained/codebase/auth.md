---
title: Auth
description: Sign-in with Better Auth, and turning any credential into a Principal.
---

# Auth

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

Sign-in, built on Better Auth: email and password, email verification, password reset, two-factor (authenticator, emailed code, backup codes), Google sign-in, sessions, and API keys.

Its main job is turning any credential (a browser cookie, a desktop bearer token, an API key) into one `Principal`: who is acting, in which organization, with which permissions. It also decides which organization a new user joins (the enrolment modes) and lets a session switch organization.

| | |
|---|---|
| Folder | `packages/auth/` |
| Files | 51 |
| Uses | [Application (the business logic)](application.md), [Content](content.md), [Contracts](contracts.md), [Core](core.md), [Infrastructure (the real adapters)](infrastructure.md), [Permissions](permissions.md) |
| Used by | [Composition (the wiring)](composition.md) |

## Every file

### `packages/auth/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tables.ts` | `pnpm auth:tables`: prints the database tables Better Auth expects for the installed version, to compare against the schema after an upgrade. Changes nothing. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/auth/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/auth/src/apikey/`

| File | What it does |
|---|---|
| `api-key.hasher.ts` | `ApiKeyHasher`: what authenticating an API key needs: its lookup prefix, its digest, and a constant-time comparison. |
| `api-key.resolver.ts` | `ApiKeyResolver`: turns an API key in a request header into a principal. On every request, the key's permissions are narrowed to what its issuer can still do, and a deactivated issuer's keys stop working. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/auth/src/factory/`

| File | What it does |
|---|---|
| `auth.config.ts` | `AuthConfig`: every sign-in setting (secret, URLs, trusted origins, session lifetime, enrolment mode, Google keys), passed in from the environment. |
| `auth-surface.ts` | `AuthSurface`: names the client a session was opened from, the desktop app or the web, from the request's exact origin. |
| `auth.factory.ts` | `AuthFactory`: the one place Better Auth (the sign-in library) is configured: email and password, email verification, password reset, two-factor, Google sign-in, sessions stored in Postgres and cached in Redis, cookie settings, rate limits, and the hook that attaches an organization to each new session. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/auth/src/mail/`

| File | What it does |
|---|---|
| `auth.mailer.ts` | `AuthMailer`: the interface for the emails sign-in needs (verify email, reset password, change email, two-factor code). The implementation owns the wording. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/auth/src/plugin/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `organization.plugin.ts` | `OrganizationPlugin`: a Better Auth plugin with three endpoints that change which organization a session points at: switch, create, and accept an invitation. A switch is only allowed into an organization the person is an active member of. |

### `packages/auth/src/principal/`

| File | What it does |
|---|---|
| `capability.cache.ts` | `CapabilityCache`: caches each person's resolved permissions in Redis for 60 seconds, keyed by organization and user. Platform permissions are cached separately, per user. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `principal.builder.ts` | `PrincipalBuilder`: turns a request's headers into a `Principal`. Checks an API key first (so a key can never be upgraded to the full session), then the session cookie or bearer token, then resolves permissions. |

### `packages/auth/src/session/`

| File | What it does |
|---|---|
| `better-auth-session.gateway.ts` | `BetterAuthSessionGateway`: ends all of a user's sessions through Better Auth, which also clears the cached copies. |
| `better-auth-session.resolver.ts` | `BetterAuthSessionResolver`: reads the session from a request through Better Auth. The only file that names Better Auth's session API. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `invitation-claiming.enroller.ts` | `InvitationClaimingEnroller`: at sign-in, first turns a pending invitation for the person's email into a membership; only if there is none does it fall back to the configured enrolment mode. |
| `invitation.claimer.ts` | `InvitationClaimer`: the interface for previewing an invitation link and turning an invitation into a membership. The verified email address is what proves it is yours. |
| `membership.enroller.ts` | `MembershipEnroller`: the interface for giving a new user their first membership. Returning nothing means the sign-in is refused. |
| `membership.reader.ts` | `MembershipReader`: the interface for which organizations a user belongs to and whether a membership is active. |
| `null-membership.enroller.ts` | `NullMembershipEnroller`: the `invite` mode: nobody can join without an invitation, so it always returns nothing. |
| `organization.founder.ts` | `OrganizationFounder`: the interface for creating an organization and making one person its owner. |

### `packages/auth/tests/apikey/`

| File | What it does |
|---|---|
| `api-key.hasher.spec.ts` | Tests `api-key.hasher.ts`. |
| `api-key.resolver.spec.ts` | Tests `api-key.resolver.ts`. |

### `packages/auth/tests/factory/`

| File | What it does |
|---|---|
| `auth-surface.spec.ts` | Tests `auth-surface.ts`. |
| `auth.factory.spec.ts` | Tests `auth.factory.ts`. |

### `packages/auth/tests/plugin/`

| File | What it does |
|---|---|
| `organization.plugin.spec.ts` | Tests `organization.plugin.ts`. |

### `packages/auth/tests/principal/`

| File | What it does |
|---|---|
| `capability.cache.spec.ts` | Tests `capability.cache.ts`. |
| `principal.builder.spec.ts` | Tests `principal.builder.ts`. |

### `packages/auth/tests/session/`

| File | What it does |
|---|---|
| `better-auth-session.gateway.spec.ts` | Tests `better-auth-session.gateway.ts`. |
| `better-auth-session.resolver.spec.ts` | Tests `better-auth-session.resolver.ts`. |
| `invitation-claiming.enroller.spec.ts` | Tests `invitation-claiming.enroller.ts`. |
| `null-membership.enroller.spec.ts` | Tests `null-membership.enroller.ts`. |

### `packages/auth/tests/support/`

| File | What it does |
|---|---|
| `doubles.ts` | Hand-written fakes for the auth tests (capability repository, platform reader, cache, API key repository, session resolver). |

### `packages/auth/docs/`

| File | What it does |
|---|---|
| `index.md` | Identity, and the wall Better Auth stops at. Four credential types collapse into one Principal here, so a single Authorizer.assert() serves the browser, the desktop shell, an integration's API key, and the worker. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/auth/docs/reference/`

| File | What it does |
|---|---|
| `api-key.md` | Shown once, stored as a digest, looked up by prefix, compared in constant time — and re-intersected with the issuer's live capabilities on every request rather than frozen at creation. |
| `auth-factory.md` | The one place Better Auth is configured, option by option — the two storage traps that put credentials on an LRU cache, the session hook that resolves the tenant, the cookie cache window, and the five rate-limit rules that are not the default twenty. |
| `capability-cache.md` | Sixty seconds, and no longer — the TTL is a revocation window rather than a performance dial. Plus why the key carries the organization, and why it carries it in that position. |
| `enrolment.md` | Why a session is refused to a user with no membership, the three modes that give them one, the invitation claim that runs before any of them, and why tenancy is a binding in the DI root rather than a policy baked into an adapter. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `organization-plugin.md` | Switch, create, accept — the three actions that end in a session pointing at a different tenant, and why each is a Better Auth endpoint rather than an oRPC procedure. |
| `principal-builder.md` | Four credential types collapse into one Principal here. Why the API key is checked before the cookie, why a rejected key never falls through to the session, and what the builder deliberately does not do. |
| `social-login.md` | Why the provider is absent rather than half-configured, what makes auto-linking safe here and an account-takeover path elsewhere, and how a server-only flag reaches a button in the browser. |
| `two-factor.md` | Three factors that are alternatives rather than a sequence, why enrolment is not finished until a code comes back, why the OTP period is in minutes, and what the password on every management call is actually protecting. |
