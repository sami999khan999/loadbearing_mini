## What it is

Creating an account with a name, an email address and a password, then proving the address is
really yours by clicking a link sent to it.

## Why the email check exists

Without it, anyone could sign up as someone else. The check also makes sure password-reset emails
and invitations reach the right person.

## Step by step

:::steps
### Open Sign up

Go to `/sign-up`. Fill in **Your name**, **Email**, **Password** and **Confirm password**.

### Choose a strong password

At least **12 characters** (up to 128). A short one gets "Use at least 12 characters."

### Press Create an account

The page changes to "Check your inbox to confirm your email address."

### Open the email

Its subject is **Confirm your email address**. Press **Confirm this address**. The link works
for **one hour**.

### Sign in

The confirmation page says "Your email address is confirmed. You can sign in now." Signing in is a
separate step; you are not signed in automatically.
:::

## What a new person gets

By default, every new account gets **an organization of its own**, named after them, with them as
its **Owner**. If an invitation is waiting for that address, they join the inviting organization
instead.

## Good to know

> [!WARNING]
> **Until the address is confirmed, sign-in fails** with the general message "That email and
> password did not match." If someone says their password is right but sign-in fails, ask whether
> they clicked the confirmation link.

- No email arrived? Press **Send it again**, and check the worker is running (see [Mail](/docs/admin-guide/mail)).
- An address already in use gets "There is already an account with that email. Try signing in instead."
- The confirmation link that expired or was used shows "That link has expired or has already been used."

:::accordion{title="Limits"}
Five sign-ups a minute and three "Send it again" a minute from one place, to stop abuse.
:::

:::accordion{title="Other ways new people can join (settings)"}
The server setting `AUTH_ENROLMENT_MODE` decides what a new account gets: `personal` (the default,
its own organization), `bootstrap` (everyone joins one shared organization) or `invite` (only
invited people may join).
:::
