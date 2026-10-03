## What it is

**Settings** → **Roles**: the roles in this organization and a grid of exactly what each may do.

## The four built-in roles

They are marked **Built in** and cannot be edited.

| Role | Can do |
|---|---|
| **Owner** | everything in the organization, including features added later |
| **Administrator** | manage roles, see exceptions, see and invite members, notifications, and everything in docs |
| **Member** | see members, notifications, read docs |
| **Guest** | nothing until given something |

> [!NOTE]
> API keys, AI document search, deactivating members, changing roles and editing the grid are
> **Owner only** by default. To let others do them, create a custom role.

## Step by step: a custom role

:::steps
### Create it

Under **New role**, fill in **Key** (lower-case, permanent once created), **Name** and
**Description**. Press **Create role**. It starts with no permissions.

### Tick its permissions

In the grid, find the role's column and tick boxes. Ticking a permission also ticks what it needs:
**Create and revoke API keys** brings **View API keys** with it.

### Give it to people

Invite people with this role.
:::

## Reading the grid

- Rows are permissions, grouped by module; columns are roles.
- Built-in columns show **Allowed** or **Denied**.
- A greyed box marked **Not included in your plan** is outside the organization's plan. The tick is
  kept, and works again if the plan is upgraded.

## Who can use it

| Action | Permission |
|---|---|
| See roles | `rbac.role.read` |
| Create, rename, delete roles | `rbac.role.manage` |
| Tick boxes in the grid | `rbac.permission.grant` and `rbac.permission.revoke` |

## Good to know

- You cannot give a role a permission you do not hold yourself.
- A role someone still holds cannot be deleted: "Someone still holds this role. Move them to another role first."
- Unticking a permission does not untick the ones that depend on it.
