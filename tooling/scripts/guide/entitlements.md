## What it is

An organization's **entitlements** are what it is actually allowed to use: its plan, plus any extras
you add or take away for that one organization.

## Why it exists

For the cases a plan does not fit: a two-week trial of one feature, a customer who negotiated an
extra, or a feature taken away from one customer who misused it.

## How it works: who wins

When the app decides whether an organization may use a permission, it checks these in order and
stops at the first that applies:

:::steps
### The core and the platform

The app's basic permissions and platform permissions are always allowed. Nothing can remove them.

### A switched-off module

If its module is switched off, it is not allowed, for anyone.

### A removal you made

If you removed it for this organization, it is not allowed.

### An addition you made

If you added it for this organization, it is allowed.

### The plan

Otherwise, the plan decides.
:::

> [!TIP]
> In short: **removed beats added, added beats the plan, and a switched-off module beats
> everything.**

## Step by step: moving an organization to a plan

:::steps
### Find the organization

On **Plans and entitlements** (`/platform/entitlements`), under **One organization**, type its id or address in
**Organization id or slug**.

### Read where it stands

You see **Entitled to** a number of permissions, and for each role how many of its permissions it
can actually use.

### Pick the plan

Choose it under **Plan** and press **Move to this plan**. Roles are not changed; only what they can
use.
:::

## Step by step: a trial, or an extra

:::steps
### Choose the permission and effect

In **Adjustments**, pick a **Permission** and an **Effect**: **Added** or **Removed**.

### Give a reason and, for a trial, an end date

**Reason** is required. Set **Expires (leave empty for permanent)** to the trial's end, which must be
in the future.

### Press Adjust

You see **Adjusted:** and the list. Adding also adds what the permission needs; removing also
removes what depends on it.
:::

To undo one row, press **Clear** on it. There is no confirmation.

## Good to know

:::accordion{title="When does an expired trial disappear?"}
The moment it expires it stops counting. The row itself is tidied away by the nightly clean-up at
03:00 UTC.
:::

## Who can use it

`platform.entitlement.manage`.
