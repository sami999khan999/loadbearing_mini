---
title: The Better Auth boundary
description: Why both clients throw instead of returning { data, error }, why a successful sign-in can be a failure, and the code-then-status table BetterAuthErrorNormalizer maps with.
---

# The Better Auth boundary

`AuthClient` and `AccountClient` are the only files naming Better Auth's client; everything above sees
`AppError` and promises that resolve or throw.

## Two inferred client types, one instance

The unexported `createClient` exists for its return type: `ReturnType<typeof createAuthClient>` is the
**unconfigured** client, erasing the two-factor plugin's `client.twoFactor`, so the type is inferred
from the options — the server's `AuthFactory.create` trap
([auth-factory](../../../auth/docs/reference/auth-factory.md)). `AccountClient` takes the `AuthClient`,
so there is **one Better Auth instance per tree** sharing cookie handling and plugins. The split follows
the route groups, `(shell)` vs `_authenticated`; only the first renders to anonymous visitors.

## Throwing is what makes the error codes reachable

Every method throws an `AppError` rather than returning `{ data, error }` or throwing a bare `Error` —
`ErrorNormalizer` maps non-`AppError`s to `INTERNAL`, which makes **every caller branch on the code
unreachable** (the bug `T-005` closed for the two-factor fork).

## A successful sign-in that is not one

With a second factor enrolled, Better Auth answers `200 { twoFactorRedirect: true }` and no `error`, so
an `error`-only check resolves and navigates away from an incomplete sign-in.

```ts
if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect === true) {
  throw new TwoFactorRequiredError();
}
```

As a throw, the caller branches on the code once. The second leg has three alternatives (authenticator
app, backup code for a lost phone, mailed code for an absent one), all throwing on a bad code — one
error path for the form.

## `BetterAuthErrorNormalizer`: code first, then status

`BetterAuthError` is structural (the library's type is plugin-generic; three fields are read).
**By code** — only codes a form branches on:

| Better Auth code | Becomes | Why |
|---|---|---|
| `USER_ALREADY_EXISTS`, `…_USE_ANOTHER_EMAIL` | `ConflictError("user", "email")` | |
| `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_OR_EXPIRED_TOKEN` | `ValidationError` on `token`, rule `invalid` | A user cannot act on the difference between "expired" and "already used" — both mean "ask for a new one" |
| `PASSWORD_TOO_SHORT` / `…_TOO_LONG` | `ValidationError` on `password` | |
| `NOT_A_MEMBER` | `ForbiddenError("organization.switch")` | |
| `INVITATION_NOT_CLAIMABLE` | `NotFoundError("invitation", "token")` | `NOT_FOUND` rather than `FORBIDDEN` for a dead invitation: it is the code the landing page has copy for, and a 403 reads as "please sign in" — which they just did |

**Else by status, never message** — `error.message` is English prose that breaks on their next release
and in every other locale.

| Status | Becomes |
|---|---|
| 429 | `RateLimitedError("auth")` |
| 400 | `ValidationError` with no violations at all |
| 401 | `UnauthorizedError("rejected")` |
| 403 | `ForbiddenError("rejected")` |
| anything else | `InternalError()` |

**401 and 403 get separate arms** (shared until `P2.17`): 401 is "please sign in"; telling a signed-in
user who may not to sign in reads as a broken session. **The 400 arm has no violation** — an empty
`field` once rendered " is not valid."; `ErrorCopy.field` now uses the generic sentence for any
fieldless violation.

## Method-level decisions worth knowing

| Method | Decision |
|---|---|
| `signUp` | No session is issued: `autoSignIn` is off and verification is required, so success means "go and read your email" |
| `signInWithGoogle`, `linkGoogle` | Better Auth navigates the browser away, so the normal path is that the call is still pending when the page unloads. An error is a misconfiguration, not a user mistake |
| `requestPasswordReset` | Deliberately resolves on a rejection too. One message either way, because a distinguishable error is an oracle for which addresses are registered |
| `changePassword` | `revokeOtherSessions: true` is not optional: changing a password because it may be known to someone else, and leaving their session alive, is the failure the flow exists to prevent |
| `changeEmail` | The confirmation goes to the address being moved *away from* — the server decides that, not this call |
| `enableTwoFactor` | The password is not ceremony: without it, a stolen session could enrol its own authenticator and lock the owner out permanently. Two-factor is **not** on when this resolves — `verifyTotpEnrolment` proves the secret reached an app first |
| `regenerateBackupCodes` | Invalidating every previous code is the point of the flow, not a side effect |
| `unlinkAccount` | The caller decides whether it is allowed — only it can see the whole list. Better Auth's `allowUnlinkingAll` stays at its default `false` as the backstop |
| `revokeOtherSessions` | Every session but this one, so it is usable from a settings page. `signOut` is the other button |
| `signOut` | Throws like every other write. `useSignOut` clears the whole cache in `onSuccess`, and clearing it over a session the server still honours leaves a signed-out shell in front of a signed-in user |

`listAccounts` and `listSessions` return ISO strings: a `Date` dehydrates to a string through the
TanStack cache, so the type would lie on the second render. The vanilla-client choice is explained in
the [package index](../index.md#why-the-vanilla-better-auth-client).
