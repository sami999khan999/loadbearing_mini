## What it is

The editor is where a page is written, previewed, saved and published. Every published version is
kept, so you can always go back.

## Step by step: from a blank space to a live page

:::steps
### Create a space

At **Manage docs**, fill in the **New space** form. You need a **Title** and an **Address**. The
address becomes the web address: lower-case letters, numbers and single hyphens, such as
`user-guide`. Press **Create space**.

### Open its pages

In the space's row, press **Pages**. A new space says "No pages yet. Add the first one."

### Add a page

In the add form, choose a **Kind**: **Page**, **Section heading** or **External link**. Type a
**Title**, choose where it goes (**—** means the top level), and press **Add**. The page's
address is made from its title.

### Write it

Open the page. Type in **Content** using Markdown. Switch to **Preview** to see exactly what
readers will see. The draft saves itself two seconds after you stop typing, or press
**Save draft**.

### Publish

Press **Publish**. You will see "Published as revision 1." Readers see it now.
:::

## What goes live when

| Change | Goes live |
|---|---|
| Text, title, description | only when you press **Publish** |
| Address, icon, position in the sidebar, access links | as soon as it is saved |
| Section headings and external links | as soon as they are saved, since they have no text |

## Arranging the sidebar

Each row on the **Pages** screen has small buttons:

- **↑ / ↓** move a page up or down.
- **→** tucks it under the page above.
- **←** moves it out one level.
- **×** deletes it. The first press asks again ("Delete … and everything under it"); the second
  press deletes.

The badge on each row tells you its state:

| Badge | Meaning |
|---|---|
| **Draft** | never published |
| **Published** | readers see exactly what you wrote |
| **Unpublished changes** | published, but you have edited it since |
| **Linked to a feature** | it has an access link of its own |

## History and restoring

The **History** panel beside the editor lists every revision: "Revision 1", "Revision 2", and so
on.

:::steps
### Pick an old revision

Find it in **History**.

### Press Restore to draft

Its text becomes your draft: "Revision 2 is now the draft. Publish it to make it live."

### Publish

Nothing changes for readers until you publish.
:::

## Good to know

> [!WARNING]
> **Two people editing one page.** Every save remembers which version it started from. If someone
> else saved in between, you get a conflict instead of silently overwriting their work. Reload the
> page, and your colleague's text is there.

:::accordion{title="A page's address skips its section"}
A page under the section "Guides" lives at `/docs/space/writing`, not `/docs/space/guides/writing`.
So two pages in different sections cannot share an address. Pages inside other pages do include
the parent's address.
:::

:::accordion{title="Limits"}
- A title can be up to 160 characters, and a description up to 300.
- A page's content can be up to 200,000 characters.
- Nesting stops at six levels, and nothing can go under an external link.
:::

:::accordion{title="Deleting a space"}
**Delete space** asks for a second press, worded "Delete … and every page in it". The space, its
pages, its history and its images are removed.
:::
