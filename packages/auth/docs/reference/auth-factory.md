---
title: AuthFactory
description: The one place Better Auth is configured, option by option — the two storage traps that put credentials on an LRU cache, the session hook that resolves the tenant, the cookie cache window, and the five rate-limit rules that are not the default twenty.
---

# `AuthFactory`

`AuthFactory.create()` is the only `betterAuth()` call in the repository. Every option is a security
boundary or what makes a whole surface work; this page carries the reasoning so the file can state
constraints and stop.

## Why the return type is inferred

`create()` is the package's one method with no return annotation, and must stay so:
`ReturnType<typeof betterAuth>` is the *unconfigured* `Auth<BetterAuthOptions>`, and the two-factor
plugin widens the user type, so annotating fails to assign. The type is read back out of the options:

```ts
export type AuthInstance = ReturnType<typeof AuthFactory.create>;
```

Every consumer names that alias (`BetterAuthSessionResolver` takes one, `Container` holds one).

## The two secondary-storage traps

Configuring `secondaryStorage` flips two unrelated defaults, each moving a credential off Postgres onto
the `allkeys-lru` Redis:

| Option | Default with secondary storage | What that costs |
|---|---|---|
| `session.storeSessionInDatabase` | Better Auth stops writing the `sessions` row | An ordinary eviction is a random sign-out |
| `verification.storeInDatabase` | The verification table is never created | A reset link stops working, with no error on either side |

Both are `true` here. **Redis sits in front of Postgres, never instead of it** — every miss falls
through to the table, which makes eviction survivable
([`data-and-scale.md`](../../../../docs/opinions/data-and-scale.md)). Rate-limit counters deliberately
use `storage: "secondary-storage"`: a lost counter means a few extra attempts, never a lockout.

## The cookie cache window

```ts
cookieCache: { enabled: true, maxAge: config.cookieCacheMaxAgeSeconds }
```

Most requests skip the session lookup — the largest performance win in the file, for one block. But
the window is how long a revoked session keeps working, like the `CapabilityCache` TTL, so `env.ts`
caps `AUTH_COOKIE_CACHE_MAX_AGE_SECONDS` at 60 and a deploy raising it fails at boot
([`capability-cache.md`](./capability-cache.md)).

## The session-create hook resolves the tenant

`databaseHooks.session.create.before` gives a session its `activeOrganizationId`, once at sign-in, so
later requests read it off a session Better Auth loads anyway:

```ts
const organizationId =
  (await memberships.activeOrganizationFor(userId)) ?? (await enroller.enrol(userId));

if (!organizationId) return false;
```

- **The reader runs first**, answering every session after the first — enrolment is not on the sign-in
  path.
- **Not a `user.create.after` hook:** Better Auth queues those until the sign-up endpoint finishes,
  *after* this hook has refused the session. This is the first moment a membership can exist and be
  seen.

`false` aborts the session, so a user with no membership fails sign-in rather than getting an unscoped
principal. `AUTH_ENROLMENT_MODE` picks the enroller ([`enrolment.md`](./enrolment.md)). `surface` is
pinned here from the request origin, and it and `activeOrganizationId` are `input: false`, so a
sign-up body cannot name its tenant or claim a surface.

## Desktop origins

```ts
const DESKTOP_ORIGINS: readonly string[] = ["tauri://localhost", "http://tauri.localhost"];
```

Both: `tauri://localhost` on macOS and Linux, `http://tauri.localhost` on Windows — one alone works
for half the team. `AuthSurface.of` compares exactly (an `Origin` carries nothing after the host, and
a prefix match let `http://tauri.localhost.example` pass). The `bearer()` plugin is required because a
session cookie is never sent cross-origin, and the Tauri webview always is.

## Rate limits: twenty is for endpoints nobody attacks

The global rule is 20 a minute — far too loose for paths that guess a credential or send a paid email:

| Path | Window | Max |
|---|---|---|
| `/sign-in/email` | 60 s | 10 |
| `/sign-up/email` | 60 s | 5 |
| `/request-password-reset` | 60 s | 3 |
| `/send-verification-email` | 60 s | 3 |
| `/two-factor/send-otp` | 60 s | 3 |
| `/organization/create` | 60 s | 5 |
| `/invitation/accept` | 60 s | 5 |
| `/organization/switch` | 60 s | 20 |

Paths are Better Auth's own, relative to `basePath`, verified against the pinned runtime: **a rule on a
path that does not exist silently limits nothing.** Creating a tenant seeds a role set and accepting an
invitation guesses a token, hence the organization plugin's paths
([`organization-plugin.md`](./organization-plugin.md)).

## Credential options, and what each prevents

**All four mail hooks enqueue rather than send.** `AuthMailer` takes a `MailRecipient` (address, user
id, and the locale from `users.locale`, an additional field) and `QueuedAuthMailer` turns each call
into a `QueueName.MAIL` job, at `high` priority with five attempts. So **the worker must run for any
auth mail to arrive**. The recipient is a shape because these hooks are called from a token endpoint
with no request — previously every message was composed in the default locale.
`AuthFactory.recipient` normalises `user.locale` against known locales, since a loosely typed
unrecognised value would ask `ContentSource.translator` for a missing catalog.

| Option | Value | The failure it prevents |
|---|---|---|
| `revokeSessionsOnPasswordReset` | `true` | The difference between "changed my password" and "actually locked them out" |
| `sendResetPassword` | mailer | Without it the reset endpoint mints a token with nowhere to send it — "forgot password" returns 200 and is a dead end |
| `minPasswordLength` | 12 | Better Auth defaults to 8; length is the only defence a password rule actually buys |
| `maxPasswordLength` | 128 | Hashing is deliberately slow, so an unbounded input is CPU exhaustion on an unauthenticated endpoint |
| `autoSignIn` | `false` | With verification required the account cannot be used yet; a session would go to an address nobody has proved they can read |
| `resetPasswordTokenExpiresIn` | 3600 | A reset link is a bearer credential for the account |
| `emailVerification.sendOnSignUp` | `true` | Otherwise the account exists, the flag is false, and nothing that could clear it is ever dispatched |
| `autoSignInAfterVerification` | `false` | Verifying proves the mailbox was reachable, not that the person reading it is at that browser |

`sendChangeEmailConfirmation` goes to `user.email` — the address being moved *away from*. Better Auth
also passes the new address, deliberately unused: confirming at the destination would let someone
holding a session move the account where its owner cannot reach.

## Account linking

`trustedProviders: ["google"]` — Google asserts a verified address, so a matching sign-in is the same
person and linking avoids telling a real user their email is taken by themselves. Untrusted providers
need an explicit link from settings. `requireLocalEmailVerified` stays `true`: it stops someone
pre-registering an unverified account at a victim's address and having the victim's Google identity
linked in ([`social-login.md`](./social-login.md)).

`socialProviders` is absent, not half-configured, without credentials — an empty client id fails at
Google's consent screen where no log here explains it, and absence lets the sign-in page decide
whether to render the button. `prompt: "select_account"` stops Google silently reusing the browser's
current account.

## Model naming and ids

`modelName` is what the Drizzle adapter looks up, so those five names *are* the exports in
[`auth.schema.ts`](../../../infrastructure/src/pg/schema/auth.schema.ts), renamed to this repository's
plurals (`users` beside `organizations`, `roles`, `memberships`). Field names need no mapping —
already camelCase.

`advanced.database.generateId` returns `Uuid.v7()`. Better Auth's opaque default forced `user_id` to be
`text`; with time-ordered uuids, `UserId` (`z.uuid().brand<"UserId">()` in `contracts`) is finally true.

Additional user fields:

- **`locale`** — on the user, not a preferences table, because the first server render of every
  request reads it.
- **`deactivatedAt`** — a state, not a delete: the activity log points at this row forever.
  `input: false` keeps it off registration.
- **`lastActiveOrganizationId`** — written by the organization plugin via `internalAdapter.updateUser`,
  so it must be declared here, not only in the Drizzle schema.

`cookiePrefix: "app"` is generic because it is user-visible, and changing it invalidates every issued
cookie.

## Two-factor options

`issuer` already defaults to `appName`; it is stated so the coupling is visible. `backupCodeOptions` is
ten single-use ten-character codes — the lost-phone recovery path, and why enabling 2FA cannot lock
anyone out. `otpOptions.period` is **minutes, not seconds** (default 3; five allows for mail latency —
longer widens the window a forwarded code stays valid). See [`two-factor.md`](./two-factor.md).
