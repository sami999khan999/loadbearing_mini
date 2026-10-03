## What it is

A **grant** opens a private platform doc space to someone outside the platform team: one
organization, one person, or every organization on a plan.

## Why it exists

For docs that only some customers should read, such as premium-plan guides or a partner's
integration notes, without making them public to the whole internet.

## Before you start

The space must be in the platform organization, with **Who can read it** set to
**Only the organizations, people and plans granted access**. See [Who can read a space](/docs/admin-guide/audiences).

## Step by step

:::steps
### Open the space

At **Manage docs**, open the space's row. The **Who can read it** panel appears inside it.

### Choose who

Pick **Grant to**:

| Choice | Fill in **Who** with |
|---|---|
| **An organization** | the organization's address or id |
| **A person** | their email address |
| **Everyone on a plan** | the plan's key, such as `team` |

### Say why, and for how long

**Reason** is required: "Say why, so whoever reviews this later knows whether it can go."
**Ends on** is optional; leave it empty to keep the grant until you revoke it. A grant lasts to the
end of the chosen day.

### Press Grant access

The grant appears in the list with its end date, or **no end date**.
:::

To take it back, press **Revoke** on its row. Readers lose access at once, or within a minute for
someone already reading.

## Good to know

> [!TIP]
> **A plan grant follows billing.** An organization moved off the plan loses access by itself, and
> one moved onto it gains access.

## Who can use it

`platform.doc.grant`, while you are in the platform organization.
