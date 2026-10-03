## What it is

Your account holds the role **Platform administrator** in the platform organization. That role
holds **every permission there is**: every platform one (health, plans, flags, accounts, tenants)
and every normal one (members, roles, docs, API keys). So you run the platform organization exactly
as an owner runs theirs: you invite your team, build roles for them, and write the platform docs.

## What you can do

| Area | Address | Permission |
|---|---|---|
| Health and module switches | `/platform/status` (the **Platform** link in the menu) | `platform.status.read`, `platform.module.manage` |
| Look up and suspend accounts | `/platform/accounts` | `platform.account.read`, `platform.account.manage` |
| Export and delete tenants | `/platform/accounts` | `platform.tenant.manage` |
| Plans and entitlements | `/platform/entitlements` | `platform.entitlement.read`, `.manage` |
| Feature flags | `/platform/flags` | `platform.flag.read`, `.manage` |
| Share private platform docs | `/doc/manage` | `platform.doc.grant` |
| Your team | **Team** (`/settings/members`) | `member.read`, `member.invite`, `member.role.change` |
| Your team's roles | **Roles** (`/settings/roles`) | `rbac.role.read`, `rbac.role.manage` |
| Write and publish the platform docs | **Docs** (`/doc/manage`) | `doc.page.write`, `doc.page.publish`, `doc.space.manage` |
| This guide | `/docs/admin-guide/welcome` | any platform admin |

> [!NOTE]
> **Platform** in the menu opens all of these. Its own pages are always listed; **Team**, **Roles**
> and **Docs** appear while the platform organization is the active one. From any other
> organization, press **Open the platform organization** to switch to it.

## What you cannot do, on purpose

> [!IMPORTANT]
> **A platform admin is not an owner inside every organization.** Your powers are over the
> platform, not inside customers' data. This keeps one stolen admin account from reading every
> customer's documents.

- You get **no** permissions inside customer organizations from this role.
- Platform permissions can never be put in a plan, so no customer can be given them.
- API keys you create carry no platform rights.
- You cannot suspend yourself, delete the platform organization, or clear an organization's own
  exceptions for its people.
- Your normal permissions (members, roles, docs) work **only inside the platform organization**.
  In a customer organization you have only the role that organization gave you, if any.

## How you were made an admin

The very first admin cannot be made from inside the app, because nobody holds the right to do it
yet. It is done once from the command line:

:::steps
### The person signs up

They create an account and confirm their email, as anyone would.

### Run the grant command

On the server:

```sh
pnpm platform:grant someone@example.com
```

It prints `granted: someone@example.com is platform_admin in loadbearing`.

### Wait up to a minute

Permissions are cached for 60 seconds, so the new powers appear on their next page load, or a
minute later at worst.
:::

## Adding another admin

You no longer need the command for this. Inside the platform organization:

:::steps
### Invite them

**Platform** → **Team**, then **Invite someone**, with the role **Platform administrator**.

### Or promote someone already there

On their row, pick **Platform administrator** under **Change role** and press **Change role**.
:::

The grant command still works, and moves the person onto the role. That loses them nothing:
**Platform administrator** holds everything **Owner** does.

## Giving your team only what they need

Not everyone needs everything. Build a role in **Platform** → **Roles** and tick just what it
needs. The grid there shows platform permissions as well as normal ones. For example:

| Role | Tick |
|---|---|
| Docs editor | `doc.page.read`, `doc.page.write`, `doc.page.publish` |
| Support | `platform.account.read`, `platform.status.read`, `member.read` |

Then invite people into it. Someone holding only **Support** sees the **Platform** menu with just
the pages they may open.

> [!IMPORTANT]
> **The last platform administrator is protected.** Nobody can demote or deactivate them, and an
> Owner can never act on a platform administrator at all: changing someone's role, or switching
> them off, takes holding every permission their role gives.

## Removing an admin

Deactivate their membership in the platform organization from **Members**, or suspend the account
from **Accounts**.

:::accordion{title="What if every admin is locked out?"}
You cannot suspend the last person who can manage accounts; the app refuses. If it happens anyway,
`pnpm platform:grant` refuses a suspended account and prints the database command that lifts the
suspension by hand. That fix leaves no audit entry, so note it somewhere.
:::

