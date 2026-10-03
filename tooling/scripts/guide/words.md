These words come up on almost every page. Each one is explained in a sentence, then once more with
an example.

## The words

:::accordion{title="Organization (also called a tenant)"}
A private space for one company or team. Its people, roles, documents and settings belong to it
and to nobody else. One person can belong to several organizations and switch between them.

*Example:* Acme Ltd and Globex are two organizations. Someone at Acme can never see Globex's data.
:::

:::accordion{title="The platform organization"}
One special organization, named **Loadbearing**, that runs the product itself. Platform admins
belong to it. Its docs can be made public to the whole internet, which no other organization's
docs can.
:::

:::accordion{title="Member"}
A person who belongs to an organization. Each member has exactly one role there.
:::

:::accordion{title="Permission"}
One thing a person is allowed to do, written as a short key such as `member.invite` (invite
people) or `doc.page.write` (write doc pages). The app checks a permission before every action.
:::

:::accordion{title="Role"}
A named bundle of permissions, such as **Owner**, **Admin**, **Member** or **Guest**. Giving
someone a role gives them every permission in it. An organization can also make its own roles.
:::

:::accordion{title="Override"}
An exception for one person: one extra permission their role does not give, or one permission
taken away. It can expire on a date.
:::

:::accordion{title="Plan"}
The package an organization is on. A plan lists the permissions an organization may use at all.
If a permission is not in the plan, no role inside that organization can use it, whatever the
role says.

*Example:* on a plan without API keys, even an organization's Owner sees no API keys page.
:::

:::accordion{title="Entitlement"}
What one organization is actually allowed: its plan, plus any extras you add or remove for it.
:::

:::accordion{title="Module"}
A whole area of the product, such as Docs, Members or API keys. You can switch a module off for
every organization at once, for example during an incident.
:::

:::accordion{title="Feature flag"}
A switch for a feature that is still being built. It can be on for some organizations and off for
the rest.
:::

:::accordion{title="Platform admin (super admin)"}
You. A platform admin runs the platform: health, plans, accounts, tenants. A platform admin is
**not** automatically an owner inside every organization. See
[Your super admin account](/docs/admin-guide/your-account).
:::

## How they fit together

> [!IMPORTANT]
> Three things can each hide a feature, and each one can only narrow what the one above allows:
> 1. **A feature flag** decides whether the feature exists for that organization at all.
> 2. **The plan** (the entitlement) decides whether the organization may use it.
> 3. **The person's role** (plus overrides) decides whether this person may use it.

If someone cannot see a button, check all three, in that order.
