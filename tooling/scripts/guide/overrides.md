## What it is

An **exception** changes one permission for one person, without changing their role: give them
one extra thing for a while, or take one thing away.

## Why it exists

Roles are for groups. Sometimes one person needs something different: a member covering for a
colleague for two weeks, or one person who should not be able to invite.

## Step by step: adding an exception

:::steps
### Open their access

**Settings** → **Members** → **Access** on their row.

### Fill in Add an exception

Pick the **Permission** and the **Effect**:

- **Grant, until a date**: needs a **Reason**; the end date can be up to 90 days away, 30 if left empty.
- **Deny, permanently**: lasts until someone clears it.

### Press Add exception

You see **Changed:** and the list. A grant brings what the permission needs; a deny also removes
what depends on it.
:::

To undo one, press **Clear** on its row.

## Seeing why someone can or cannot do something

**What … can do here** lists every permission with **Allowed** or **Denied** and the reason: from
their role, an exception, denied by an exception, denied by the platform, or not in the plan.

## Who can use it

`rbac.override.read` to see exceptions, `rbac.override.manage` to change them, and
`rbac.effective.inspect` for the "what can they do" list.

## Good to know

- You cannot add an exception for yourself, or for someone whose role outranks yours.
- Rows marked **Set by the platform — contact support** were made by a super admin from
  [Accounts](/docs/admin-guide/accounts-admin), and only a super admin can clear them.
- An expired grant stops working at once; the nightly clean-up removes the row.
