## What it is

A docs site can grow to thousands of pages. These are the reasons a page still opens quickly, and
the one command you may need to run after an upgrade.

## How it works, in plain words

:::steps
### Pages are built once

The finished page is made when you **publish**, not each time someone reads it. Reading is just
fetching a stored page.

### Reads come from memory

A page someone read recently comes straight from the cache, with no database work at all. Every
published revision has its own cache entry, so a reader can never get an old version.

### The sidebar arrives light

A page arrives with only the part of the sidebar that leads to it. The rest of the tree loads
quietly a moment later, and the browser keeps it until the space changes.

### Long pages draw lazily

Parts of a very long page that are off screen are laid out only when you scroll near them.
:::

## The command to know: re-rendering after an upgrade

Now and then a new version of the kit changes how Markdown is turned into a page, for example to
add a new block. Pages published before the upgrade keep their old look until they are re-rendered.

:::steps
### Make sure the worker is running

The work happens in the background worker.

### Run the command

```sh
pnpm doc:rerender
```

### Wait

Each organization's stale pages are rebuilt, 50 at a time. Revisions, drafts and publish dates do
not change, so nothing shows as **Unpublished changes**.
:::

> [!NOTE]
> Running it twice is harmless: the second run finds nothing to do.

## Good to know

:::accordion{title="Measuring it"}
`pnpm doc:bench` builds a test space of 2,000 pages and measures page reads, search and the
sidebar. It is a tool for developers, but its numbers are recorded in the developer docs.
:::
