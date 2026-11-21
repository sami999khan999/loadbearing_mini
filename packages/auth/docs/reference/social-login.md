---
title: Google sign-in
description: Why the provider is absent rather than half-configured, what makes auto-linking safe here and an account-takeover path elsewhere, and how a server-only flag reaches a button in the browser.
---

# Google sign-in

```ts
socialProviders: config.google
  ? { google: { ...config.google, prompt: "select_account" } }
  : {},
```

## Absent, never half-configured

`apps/web` builds the `google` block only when **both** `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are present.

A half-filled pair would fail at Google's consent screen, undiagnosable from our logs; absence also lets
the sign-in page omit the button. The Google client's redirect URI must be
`${AUTH_URL}/api/auth/callback/google` (Better Auth's path, not a route file).

## `prompt: "select_account"`

Otherwise Google silently reuses the browser's account, so on a shared machine nobody else can sign in.

## Account linking, and why Google is trusted

```ts
account: {
  modelName: "accounts",
  accountLinking: { enabled: true, trustedProviders: ["google"] },
}
```

A Google sign-in matching an existing email is **linked**, not told "email taken". Safe because Google
asserts a verified address — so `trustedProviders` names one provider; an untrusted one claiming any email
is account takeover. **`requireLocalEmailVerified` stays at its default `true`** (asserted undefined in
`auth.factory.spec.ts`): it stops a pre-registered unverified account at a victim's address absorbing their
Google identity. `allowDifferentEmails` stays `false`.

## No new tables

`accounts` already has the OAuth columns (`accessToken`, `refreshToken`, `idToken`, both expiries,
`scope`) beside `password`; a linked account is a second row, told apart by `providerId` (`credential` or
`google`). **Unlinking counts:** `LinkedAccountList` hides unlink on the last row (one-click lockout), with
Better Auth's `allowUnlinkingAll: false` as backstop.

## Telling the browser whether Google exists

`Env` is server-only — a route component once read it and shipped the whole server config to the browser,
where `Schema.parse({})` threw before first render. So `googleEnabled` rides the session snapshot
(`session.fn.ts`, awaited by `__root.tsx`'s `beforeLoad`, carried by router context): no extra round trip.
`GOOGLE_CLIENT_SECRET` is in §8's `ENV_FINGERPRINTS`, so it in the client bundle fails CI.

## Tenancy still applies

A Google sign-up passes `session.create.before` like any other — enrolled by the configured
`MembershipEnroller` or refused ([`enrolment.md`](./enrolment.md)).
