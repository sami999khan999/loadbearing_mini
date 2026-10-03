## What it is

**Settings** → **Members** lists everyone in the organization and everyone who has been invited.

## Step by step: inviting someone

:::steps
### Fill in the invite form

Under **Invite someone**, type the **Email address** and pick a **Role** (Member by default).

### Press Send invitation

You see "Invitation sent to …. It expires in seven days."

### They accept

They get an email, "… invited you to …", with a **Join** button. If they have no account, they are
offered **Create an account with** their address; otherwise **Sign in as** their address. Then
**Join**.
:::

## Pending invitations

Each pending invitation shows who sent it and when it expires.

- **Resend** sends a fresh link and restarts the seven days. The old link stops working.
- **Revoke** cancels it at once.

## Changing someone's role

:::steps
### Pick the new role

On their row, open **Change role** and pick the role. Only roles you may hand out are listed:
none holding a permission you do not have.

### Confirm

Press **Change role** beside it, or **Cancel**. The person is told "Your role changed", and the new
role applies within a minute.
:::

> [!WARNING]
> **The last owner, and the last platform administrator, cannot be moved off their role.** Promote
> someone else first. The message says which one stops you.

## Deactivating and reactivating

**Deactivate** on a member's row stops them using this organization from their next click. Their
API keys stop too. **Reactivate** brings them back with the same role.

> [!WARNING]
> **The last owner cannot be deactivated**: "This is the only active owner. Promote someone else to
> owner first." And nobody can deactivate themselves.

## Seeing what someone can do

**Access** on a member's row opens **Access and exceptions**: their exceptions, and the full list
of what they can do here and why. See [One person's exceptions](/docs/admin-guide/overrides).

## Who can use it

| Action | Permission |
|---|---|
| See members | `member.read` |
| Invite, resend, revoke | `member.invite` |
| Change role | `member.role.change` (Owner only by default) |
| Deactivate, reactivate | `member.deactivate` (Owner only by default) |
| Open Access | `rbac.effective.inspect` (Owner only by default) |

## Good to know

- An invitation must be accepted from the invited address, and that address must be confirmed.
  Signed in as someone else, they see "This invitation was sent to …, but you are signed in as …".
- You cannot invite someone into a role that holds permissions you do not have.
- Badges on the list: **Owner**, **Deactivated**, **Suspended by the platform**, and
  **+ 1 exception** when someone has exceptions.
- Neither **Change role** nor **Deactivate** is offered on someone whose role holds a permission
  you lack: you cannot act on someone who outranks you.

