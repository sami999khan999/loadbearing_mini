## What it is

A **plan** is a package of permissions, such as "Starter" or "Team". Every organization is on
exactly one plan. A permission that is not in its plan cannot be used in that organization by
anyone, whatever their role says.

## Why it exists

So that what a customer pays for decides what they get, without touching their roles. Moving an
organization to a smaller plan **hides** the extra features from its roles without deleting
anything, so moving it back restores them exactly.

## The built-in plan

There is one plan you cannot edit or delete: **unlimited**, marked **Built in**. It means "every
permission", worked out fresh each time, so new features reach it automatically.

## Step by step: creating a plan

:::steps
### Open Plans and entitlements

Go to **Platform** → **Plans and entitlements**, and press
**New plan**.

### Name it

Fill in **Key**, **Name** and **Description**. The key is short, lower-case, with digits and
hyphens, such as `team`. **The key cannot be changed later.**

### Pick its permissions

Tick what the plan includes. **All of** a module ticks the whole module. Ticking a permission also
ticks what it needs, and unticking one also unticks what depends on it.

### Press Save plan

Every organization on the plan feels the change straight away.
:::

## Making it the default for new signups

Press **Use for new signups** on a plan. It gets the **New signups** badge. Only organizations
created **after** this use it; existing organizations stay on their plans.

## Deleting a plan

**Delete** is shown only for a plan that is not built in, not the default, and used by no
organization.

> [!CAUTION]
> **Delete has no confirmation**: it deletes on the first click.

## Who can use it

`platform.entitlement.read` to see plans; `platform.entitlement.manage` to change them.

## Next

::::cards
:::card{title="An organization's entitlements" href="/docs/admin-guide/entitlements" icon="file"}
Move one organization to a plan, or give it extras.
:::
::::

