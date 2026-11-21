---
title: Two-factor
description: Three factors that are alternatives rather than a sequence, why enrolment is not finished until a code comes back, why the OTP period is in minutes, and what the password on every management call is actually protecting.
---

# Two-factor

The `twoFactor` plugin, configured once in `AuthFactory`:

```ts
twoFactor({
  schema: { twoFactor: { modelName: "twoFactors" } },
  issuer: config.appName,
  backupCodeOptions: { amount: 10, length: 10 },
  otpOptions: {
    period: 5,
    sendOTP: async ({ user, otp }) => mailer.sendTwoFactorOtp(AuthFactory.recipient(user), otp),
  },
})
```

## Three factors, and they are alternatives

A `TWO_FACTOR_REQUIRED` sign-in finishes three ways, all offered by `TwoFactorForm` at once:

| Factor | Endpoint | For |
|---|---|---|
| TOTP | `/two-factor/verify-totp` | The normal path |
| Backup code | `/two-factor/verify-backup-code` | The phone is gone |
| Email OTP | `/two-factor/verify-otp` | The phone is merely elsewhere |

**No order to get stuck in** — a recovery path reachable only through the missing factor is none.
Switching clears the code (a half-typed TOTP in the backup field fails and burns one of three
attempts a minute). Without backup codes enrolment is a one-way door, hence ten generated and shown
once.

## `period` is in minutes

Better Auth's `otpOptions.period` is **minutes** (default 3); `period: 300` read as seconds is a
five-hour factor that passes review and every obvious test. Five allows for mail latency; longer widens
the window a forwarded code stays valid.

## Enrolment is not finished when `enable` returns

`twoFactor.enable` returns the `otpauth://` URI and backup codes, but two-factor is **not on** until
`verifyTotp` accepts a code from the app. Enabling on an unscanned (or misscanned) QR locks the user out
at next sign-in — hence `TwoFactorSetup`'s three steps: password, scan, prove it.
`skipVerificationOnEnable` stays `false`.

## The password on every management call

`enable`, `disable` and `generateBackupCodes` take the current password: **a stolen session must not
change what protects the account** — a hijacked cookie could otherwise enrol its own authenticator or
switch the factor off (the more dangerous).

## The QR is rendered, not fetched

`QrCode` in `packages/ui` encodes locally with `uqr` into `<rect>`s — an `<img>` from a QR service
would put the TOTP secret in a third party's access log. Modules paint `currentColor`; the secret is
also selectable text beside it for camera-less authenticators.

## Backup codes are shown once

Better Auth stores them encrypted and `viewBackupCodes` is server-only, so the app cannot show them
again — the enrolment copy carries the whole warning. Regenerating invalidates all previous codes,
which is the point for printed or screenshotted ones.

## Account lockout

Better Auth's default lockout (ten consecutive failed verifications across factors, fifteen minutes,
reset on success) is separate from `/two-factor/send-otp`'s rate limit, which caps mail sending, not
guessing.

## Related

- [`packages/auth/docs/reference/enrolment.md`](./enrolment.md) — the other thing that happens at
  first sign-in.
