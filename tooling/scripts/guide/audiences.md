## What it is

Every space has an **audience**: the answer to "who can read this?". You pick it in the field
**Who can read it** when you create or edit the space.

## The four audiences

| Option on screen | Who can read | Allowed in |
|---|---|---|
| **Members of this organization** | everyone in the organization who has `doc.page.read` | any organization (the default) |
| **Only me** | only the person who created the space | any organization |
| **Anyone, signed in or not** | the whole internet | the platform organization only |
| **Only the organizations, people and plans granted access** | platform admins, plus whoever you grant | the platform organization only |

## Why there are four

- **Members** is the everyday choice for a company's internal notes.
- **Only me** is a private notebook, such as a draft space before you share it.
- **Anyone** is for your public help site. It is also listed in `/llms.txt` so AI tools can find it.
- **Granted** is for docs that only some customers should see, for example docs for a premium plan.

## Step by step: making a private space for chosen customers

:::steps
### Open Manage docs

Go to **Docs**, then **Manage docs**, while you are in the platform organization.

### Create the space

Fill in **Title** and **Address**, and under **Who can read it** choose
**Only the organizations, people and plans granted access**. Press **Create space**.

### Grant access

Open the space's row. A **Who can read it** panel appears. Add a grant, as described in
[Sharing platform docs](/docs/admin-guide/doc-grants).
:::

## Good to know

> [!IMPORTANT]
> **Opening a space needs the sharing permission.** Moving a space onto **Anyone, signed in or not**
> or **Only the organizations, people and plans granted access** also needs `platform.doc.grant`.
> Someone who can only arrange spaces, such as a "Docs editor", can edit an open space but cannot
> open a closed one. Publishing to the whole internet stays a platform decision.


> [!IMPORTANT]
> **Only me really means only me.** Other admins, and platform admins too, get "not found". Only
> the author can switch a space to **Only me**, and a grant on an **Only me** space is refused.

:::accordion{title="Why can't an organization make a public space?"}
Public and granted spaces are for the platform's own docs. The server refuses them for any other
organization, whatever the form shows, and the form says so with the hint
"Public and granted spaces are for the platform's own docs."
:::

:::accordion{title="How is this guide protected?"}
It is a **granted** space with no grants. So the only readers are platform admins, who can always
read granted spaces, and platform staff who hold `doc.page.read`.
:::

