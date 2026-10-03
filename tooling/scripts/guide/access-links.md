## What it is

An **access link** ties a space or a page to a feature of the product. A reader sees the doc
only if they have that feature. Everyone else gets "not found", as if the page did not exist.

## Why it exists

Some docs only make sense to people who can use the feature. Docs for API keys are noise to an
organization whose plan has no API keys. With a link, the doc appears and disappears with the
feature, and nobody has to remember to update it.

## The four kinds of link

In the **Access** box of a space or a page there are four pickers. Each starts at **None**.

| Picker | The reader must… |
|---|---|
| **Module** | be able to see that module (it respects the plan and switched-off modules) |
| **Permission** | hold that permission |
| **Feature flag** | have that flag on for their organization (hidden while no flags exist) |
| **Plan** | be in an organization on that plan |

## The rules

:::steps
### Every link must pass

Set two links and the reader needs both. A page's links add to its space's links; they never
replace them.

### A hidden page hides what is under it

Its child pages disappear too, and a section heading left with nothing under it disappears.

### Hidden means not found

The page is missing from the sidebar, search, the space switcher, `/llms.txt` and raw Markdown.
Its address gives "not found".

### Signed-out readers pass no link

A visitor who is not signed in has no organization, plan or permissions, so a linked doc is for
signed-in readers only.
:::

## Step by step: a page only for people who manage roles

:::steps
### Open the page in the editor

**Manage docs** → the space's **Pages** → the page.

### Pick the permission

In **Access**, set **Permission** to "Create and edit roles (rbac.role.manage)". Leave the other three
as **None**.

### Save

Access is structure, so it goes live on save. No publish is needed. The page's row now shows
**Linked to a feature**.
:::

## Good to know

> [!CAUTION]
> **A link to something that no longer exists hides the doc from everyone.** The editor warns:
> "This links to …, which no longer exists, so nobody can read it until it is changed." That is
> on purpose: a broken link should hide a doc, never open it to everyone.

:::accordion{title="Readers from other organizations"}
A platform doc is judged against the reader's own organization. A page linked to a module shows
to every organization whose plan includes that module.
:::

:::accordion{title="Why can't I link to a platform permission?"}
Platform permissions are not held inside any organization, so a link to one would hide the doc
from every reader. The server refuses them. To keep a space to platform admins, use the
**granted** audience instead.
:::

:::accordion{title="Who can set a link"}
Space links need `doc.space.manage`, and page links need `doc.page.write`. A link can only narrow
who reads a doc, so setting one can never give anyone more access.
:::
