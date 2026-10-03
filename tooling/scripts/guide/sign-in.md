## What it is

Signing in with email and password, and **two-factor authentication**: a second check, a code from
a phone, so a stolen password alone is not enough.

## Step by step: signing in

:::steps
### Open Sign in

Go to `/sign-in`, fill in **Email** and **Password**, and press **Sign in**.

### Enter the code, if asked

With two-factor on, you are asked for an **Authentication code**: the six digits your phone app
shows. Press **Sign in** again.
:::

Sessions last 7 days and renew themselves while in use.

## Step by step: turning two-factor on

:::steps
### Open Security

Go to **Settings** → **Security**, section **Two-factor authentication**.

### Confirm your password

Type it in **Confirm your password to continue** and press **Turn on two-factor**.

### Scan the QR code

Open an authenticator app (Google Authenticator, 1Password, Authy…) and scan it. If you cannot
scan, use the key shown under "Cannot scan? Enter this key by hand instead."

### Enter the code

Type the code your app shows now and press **Save changes**.

### Save your backup codes

You get **10 backup codes**. Each one signs you in once if you lose your phone, and **this is the
only time they are shown**. Store them somewhere safe, then press **Save changes**.
:::

## If the phone is not at hand

On the code step there are two other ways in:

- **Use a backup code instead**: each backup code works once.
- **Email me a code instead**: a code is sent by email, valid for five minutes.

## Turning it off, or new backup codes

With two-factor on, the **Security** page has **Generate new backup codes** (the old ones stop
working) and **Turn off two-factor**. Both ask for your password.

> [!TIP]
> As super admin, **turn two-factor on**. Your account can suspend anyone and delete any tenant.

## Good to know

- Every failed sign-in shows the same message, "That email and password did not match.", so an
  attacker cannot tell which part was wrong.
- A suspended account sees "This account has been suspended. Contact support to restore it."
- Ten sign-in attempts a minute are allowed from one place.
