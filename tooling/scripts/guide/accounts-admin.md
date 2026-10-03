## What it is

The **Accounts** page finds any person by email, shows every organization they belong to, and lets
you lock their account everywhere at once.

## Why it exists

When an account is stolen, or someone is abusing the product, you need to stop them in every
organization in one move, not ask each organization's admin.

## Step by step: finding an account

:::steps
### Open Accounts

Go to **Platform** → **Accounts**.

### Search

Type the person's address in **Email address** and press **Enter**.

### Read the result

You see their name, email and a badge: **Active**, or **Suspended since** a date. The
**Organizations** table lists each organization and their role there. A membership the organization
itself switched off is marked **Deactivated by the organization**.
:::

## Step by step: suspending an account

:::steps
### Write the reason

Fill in **Reason (every organization it belongs to can read it)**. Every organization they belong to
can read it, so write it with that in mind.

### Press Suspend everywhere

The person is signed out on every device at once and cannot sign back in. They see "This account has
been suspended. Contact support to restore it." Their organizations' member lists show
**Suspended by the platform**.
:::

## Step by step: reinstating

Type a reason in the same box and press **Reinstate**. The person must sign in again; their old
sessions do not come back.

> [!NOTE]
> Reinstating only lifts **your** lock. If an organization had deactivated them itself, or you had
> denied them a permission, that stays.

## Taking one permission away from one person

Sometimes you do not want to lock the whole account, only stop one action.

:::steps
### Pick the organization and the permission

Under the account, choose **In organization** and **Permission**.

### Write a reason and press Deny

You see **Denied:** and the list. Anything that depends on that permission is denied with it.

### Undo it later

The **Denied by the platform** table lists your denies. Press **Clear** on a row to remove it.
:::

> [!WARNING]
> A platform deny has **no end date**. It lasts until you clear it, and the organization's own
> admins can see it but not remove it. **Clear** removes only the one row you pick, not the
> permissions that were denied along with it, and it asks no confirmation.

## Who can use it

`platform.account.read` to look people up; `platform.account.manage` to suspend, reinstate, deny
and clear.

:::accordion{title="Things the app refuses"}
- Suspending yourself.
- Suspending, or denying a permission to, the last person who can manage accounts. That would lock
  the platform out of itself.
:::

