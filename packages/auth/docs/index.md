---
title: "@loadbearing/auth"
description: Identity, and the wall Better Auth stops at. Four credential types collapse into one Principal here, so a single Authorizer.assert() serves the browser, the desktop shell, an integration's API key, and the worker.
---

# `@loadbearing/auth`

**This package answers one question: who is asking?** Everything downstream answers *may they*
against a `Principal` — tenant, user id and resolved `CapabilitySet` — blind to the credential. A browser
cookie, a Tauri bearer token, an API key and the worker's scheduled run are four things at the edge and
one object a layer in, so `Authorizer.assert(actor, "rbac.role.read")` serves all four.

```bash
grep -rn "better-auth" packages apps --include=*.ts | grep -v packages/auth
```

hits only `packages/api-client` (the *client* half, a different entrypoint). **Swapping the auth library
rewrites this package and nothing else** — why it is a package, not a folder in `apps/web/src/server/`.

| | |
| --- | --- |
| **Package** | `@loadbearing/auth` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/application`, `@loadbearing/contracts`, `@loadbearing/core`, `@loadbearing/infrastructure`, `@loadbearing/permissions`, plus `better-auth` |
| **Used by** | `packages/composition` only. Nothing else may name it — Biome bans the import from `packages/ui/**`, `packages/feature/**`, `packages/query/**` and `apps/web/src/**` |
| **Environment** | server-only; `ServerOnly.assert()` in `src/index.ts` is the runtime tripwire |

```
packages/auth/
├── vitest.config.ts
├── src/
│   ├── index.ts                          ← ServerOnly.assert() first among the statements
│   ├── import.ts                         ← every external symbol, better-auth included
│   ├── apikey/
│   │   ├── api-key.hasher.ts             → ApiKeyHasher, GeneratedApiKey
│   │   ├── api-key.repository.ts         → ApiKeyRepository, ApiKeyRecord
│   │   └── api-key.resolver.ts           → ApiKeyResolver
│   ├── factory/
│   │   ├── auth.config.ts                → AuthConfig
│   │   └── auth.factory.ts               → AuthFactory, AuthInstance
│   ├── mail/
│   │   └── auth.mailer.ts                → AuthMailer                        (port)
│   ├── plugin/
│   │   └── organization.plugin.ts        → OrganizationPlugin   (switch · create · accept)
│   ├── principal/
│   │   ├── principal.builder.ts          → PrincipalBuilder
│   │   └── capability.cache.ts           → CapabilityCache
│   ├── session/
│   │   ├── better-auth-session.resolver.ts → BetterAuthSessionResolver
│   │   ├── membership.reader.ts          → MembershipReader, OrganizationSummary   (port)
│   │   ├── membership.enroller.ts        → MembershipEnroller                (port)
│   │   ├── invitation.claimer.ts         → InvitationClaimer, InvitationPreview   (port)
│   │   ├── organization.founder.ts       → OrganizationFounder               (port)
│   │   ├── invitation-claiming.enroller.ts → InvitationClaimingEnroller      (decorator)
│   │   └── null-membership.enroller.ts   → NullMembershipEnroller
├── script/tables.ts                      ← a script, above src/. Never exported, never built
└── tests/
    ├── support/doubles.ts
    ├── apikey/{api-key.hasher,api-key.resolver}.spec.ts
    ├── factory/auth.factory.spec.ts
    ├── principal/{capability.cache,principal.builder}.spec.ts
    └── session/{better-auth-session.resolver,invitation-claiming.enroller,null-membership.enroller}.spec.ts
```

---

## The ports declared here, not in `application`

`MembershipReader`, `MembershipEnroller`, `InvitationClaimer`, `OrganizationFounder`, `AuthMailer` and
`ApiKeyRepository` break the rule that ports live in `application/src/port/`, for one reason: **they
populate an authentication artifact no use-case should know exists** — sessions with an organization
column, first sessions granted by invitation, reset by email, API keys at all. Their implementations live
in `infrastructure` and `composition`, which cannot import this package's types (`auth` depends on
`infrastructure`; `composition` on both), so binding is **structural**, checked where they meet:

```ts
// packages/composition/src/container/container.ts
this.memberships = new PgMembershipReader(…);          // declared as MembershipReader
```

Signature drift fails `composition`'s typecheck on that line, not at runtime.

---

## The wall

```
     cookie ─┐
bearer token ─┼─→ BetterAuthSessionResolver ─┐
             │                               ├─→ PrincipalBuilder ─→ Principal
    x-api-key ──→ ApiKeyResolver ────────────┘
```

`BetterAuthSessionResolver` is the only file naming Better Auth's session API; it returns the
`application` port shape `ResolvedSession`. **It refuses a session with no `activeOrganizationId`** —
one predating the create hook or written by hand — since guessing a tenant is an unnoticed cross-tenant
read.

---

## Sign-in, end to end

Two `AuthFactory` options are the whole tenancy design:

- **`databaseHooks.session.create.before` pins the tenant onto the session row** once at sign-in, so
  requests read it off a row Better Auth loads anyway — not a membership query per call or a
  client-chosen header. `false` aborts the session: no membership, no sign-in.
- **`MembershipEnroller` writes the first `memberships` row** — otherwise a fresh database never
  produces a session. It runs from the same hook, not `user.create.after`, which Better Auth queues
  until the sign-up endpoint finishes, *after* the session was refused.

`AUTH_ENROLMENT_MODE` picks the enroller, every mode wrapped so an invited address joins its inviter
first ([enrolment](reference/enrolment.md)). **A user in two organizations is in exactly one per
session** — the last switched to, else the oldest membership; moving is an explicit act through the
organization endpoints.

---

## Switching, founding, accepting

`OrganizationPlugin` mounts `/organization/switch`, `/organization/create` and `/invitation/accept` on
Better Auth; each rebinds the session row and its Redis copy to the new tenant and **re-issues the
cookie cache**. They are endpoints, not oRPC procedures, because only a handler with Better Auth's `ctx`
can call `setSessionCookie`, and they are identity- not permission-gated
([organization-plugin](reference/organization-plugin.md)).

---

## What is deliberately *not* used

| | |
|---|---|
| The organization plugin | No. `organizations`, `memberships` and `goal_members` are yours, and they point at your own `roles` table. The plugin would add a parallel `member.role` string meaning something else, and reconciling the two is worse than not having it. The one thing it does that nothing else can — rebind a session and re-issue its cookie — is sixty lines in `plugin/organization.plugin.ts`, against your tables. |
| `better-auth/react` | No, and not in `api-client` either. It keeps its own cache with its own invalidation rules, which puts two caching systems in one app — and they disagree on sign-out, showing a signed-in shell around a run of 401s. |
| `@better-auth/cli` | No. It trails the library's release line, and a generator behind the runtime writes a schema that is wrong exactly where it matters. `tables.ts` prints the truth from the pinned runtime instead. |
| Secondary storage for sessions | Redis in **front** of Postgres, never instead of it. `storeSessionInDatabase: true` and `verification.storeInDatabase: true` are both non-default and both load-bearing: without them an ordinary cache eviction is a random sign-out, or a reset link that stops working with no error on either side. |

---

## Reference

- [`PrincipalBuilder`](reference/principal-builder.md) — why the API key is checked before the cookie,
  and why there is no fall-through.
- [`CapabilityCache`](reference/capability-cache.md) — the sixty-second TTL, and why it is a
  revocation window rather than a performance dial.
- [The API-key model](reference/api-key.md) — hash-only storage, prefix lookup, and re-intersection
  with the issuer's live capabilities on every request.
- [Membership enrolment](reference/enrolment.md) — the tenancy gate, the three modes, the invitation
  claim that runs before them, and the locks.
- [`AuthFactory`](reference/auth-factory.md) — the two secondary-storage traps, the cookie cache
  window, the session hook that resolves the tenant, and the five rate limits that are not twenty.
- [`OrganizationPlugin`](reference/organization-plugin.md) — why switch, create and accept are
  endpoints rather than procedures, and the order `rebind()` writes in.
- [Two-factor authentication](reference/two-factor.md) — enrolment, the OTP fallback, and why backup
  codes are shown exactly once.
- [Social login](reference/social-login.md) — trusted providers, account linking, and the
  pre-registration attack `requireLocalEmailVerified` stops.

---

## Gate

- `pnpm --filter @loadbearing/auth test` passes.
- `pnpm --filter @loadbearing/auth run auth:tables` runs, and every field it prints has a matching
  property in `packages/infrastructure/src/pg/schema/auth.schema.ts` **under Better Auth's own name** —
  the Drizzle adapter resolves a column by looking up `schema[model][field]`, so the property keys are
  load-bearing and the SQL column names are not.
- `grep -rn "better-auth" packages apps --include=*.ts | grep -v packages/auth | grep -v packages/api-client`
  returns nothing.
- Adding `import { AuthFactory } from "@loadbearing/auth"` to a file in `packages/feature/src/` is a
  Biome error.
