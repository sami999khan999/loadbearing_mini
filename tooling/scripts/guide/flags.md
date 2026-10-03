## What it is

A **feature flag** is an on/off switch for a feature that is still being built. It can be on for
everyone, or only for a list of organizations, such as the ones testing it early.

## Why it exists

So unfinished work can be shipped safely, switched on for a few customers, and opened to everyone
when it is ready, without a new release.

## How it works

Each flag is first declared in the code by a developer, with an owner and an expiry date. Then it
is switched here. A flag with no switch set is **off**.

> [!NOTE]
> **This kit ships with no flags declared.** The page then says
> "No flag is declared, and none is stored." That is normal. Flags appear here when developers add them.

## Step by step: a staged rollout

:::steps
### Open Feature flags

Go to **Platform** → **Feature flags**. Each row shows **Flag**, **Owner**, **Expires**,
**Everyone** and **Also on for**.

### Turn it on for a few organizations

Pick the **Flag**, type an **Organization id or slug**, and press
**Turn on for this organization**. Repeat for each early customer.

### Turn it on for everyone

When it is ready, press **Turn on for everyone**.
:::

To remove one organization, press **Turn off for** and that organization's address.

## Good to know

- **Past its expiry date — retire it**: the flag has outlived its plan. Ask its owner to finish
  the feature and remove the flag from the code.
- **Not declared in code**: the code no longer reads this flag, so it does nothing. It can only be
  turned off, which clears it.
- A feature behind a flag that is off answers "not found", so it looks as if it does not exist.

## Who can use it

`platform.flag.read` to see flags; `platform.flag.manage` to switch them.

