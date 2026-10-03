## What it is

The docs system is a small website builder inside the app. You write pages in **Markdown**, a
plain-text format, and the app turns them into tidy pages with a sidebar, search and an outline.
This guide is itself written in it.

## Why it exists

Every product needs help pages, and every company using the product needs its own internal notes.
Both live here, so nobody needs a second tool, and the same permissions that protect the rest of
the app protect the docs too.

## The two kinds of docs

| | Organization docs | Platform docs |
|---|---|---|
| Address | `/doc` | `/docs` |
| Who writes them | any organization, for its own people | the platform team (you) |
| Who reads them | that organization's members | anyone you choose, even the whole internet |
| Sign-in needed | yes | no, unless the space is private |

> [!NOTE]
> Underneath, they are the same thing. Platform docs are simply the spaces that belong to the
> platform organization. You write them at **Manage docs** while you are in the platform
> organization.

## Spaces and pages

- A **space** is one small website, such as "User guide" or "API reference". Each has its own
  address, its own sidebar and, if you like, its own colour theme.
- A **page** lives inside a space. Pages can sit inside other pages, up to six levels deep.
- A **section heading** groups pages in the sidebar. It has no text of its own.
- An **external link** is a sidebar entry that opens another website.

## How it works

:::steps
### You write a draft

Typing saves a draft. Readers never see a draft.

### You press Publish

The app turns your Markdown into a finished page **once**, and stores it as a numbered revision.

### Readers read the stored page

Nothing is re-built when someone reads. That is why pages open quickly even in a very large space.
:::

## Who writes them

**To change an organization's docs, you must belong to it.** Every save checks the permission in
the organization you are signed into, and another organization's pages are simply not found.

- **Organization docs:** the organization's Owner and Administrators can do everything; Members can
  only read.
- **Platform docs:** the platform organization's **Platform administrator** can do everything, and
  you can give your team a narrower role, such as "Docs editor", in **Platform** → **Roles**.

## Who can use it

| Permission | Lets a person |
|---|---|
| `doc.page.read` | read, search and list docs |
| `doc.page.write` | open the editor, save drafts, add, move and delete pages, upload images |
| `doc.page.publish` | publish a page so readers see it |
| `doc.space.manage` | create, edit and delete spaces |
| `platform.doc.grant` | make a space public or granted, and share a granted one (see [Sharing platform docs](/docs/admin-guide/doc-grants)) |

> [!WARNING]
> The **Publish** button is shown to everyone who can edit. Pressing it without
> `doc.page.publish` gives an error: the server checks, not the button.

## Next

::::cards
:::card{title="Who can read a space" href="/docs/admin-guide/audiences" icon="user"}
The four audiences.
:::
:::card{title="Writing and publishing" href="/docs/admin-guide/writing" icon="edit"}
From a blank space to a live page.
:::
::::

