## What it is

Markdown is plain text with a few marks that mean "make this a heading" or "make this bold". The
docs system adds a handful of extra blocks for help pages. Each block below shows **what you type**
and then **what readers see**.

> [!TIP]
> Use **Preview** in the editor while you learn. It uses the real renderer, so what you see there
> is exactly what readers get. A misspelled block name shows up as plain text in the preview,
> which makes typos easy to spot.

## The basics

```md
## A heading (also listed under "On this page")
### A smaller heading

Some **bold** text, some *italic* text, and `a bit of code`.

- a list item
- another one

1. a numbered item
2. another one

[a link](https://example.com)
```

Headings from `##` to `####` get an anchor and appear in the **On this page** outline.

## Callouts

Five tones, for notes, tips and warnings. The tone shows in the colour, and there is no title word.

```md
> [!NOTE]
> Something worth knowing.
```

> [!NOTE]
> Something worth knowing.

> [!TIP]
> A helpful shortcut.

> [!IMPORTANT]
> Something the reader must not miss.

> [!WARNING]
> Something that can go wrong.

> [!CAUTION]
> Something that cannot be undone.

## Cards

A grid of link cards. `icon` is optional, and an unknown icon name simply shows none.

```md
::::cards
:::card{title="Quick start" href="/docs/admin-guide/welcome" icon="rocket"}
Get going in five minutes.
:::
:::card{title="Reference" href="/docs/admin-guide/words" icon="book"}
Every word explained.
:::
::::
```

::::cards
:::card{title="Quick start" href="/docs/admin-guide/welcome" icon="rocket"}
Get going in five minutes.
:::
:::card{title="Reference" href="/docs/admin-guide/words" icon="book"}
Every word explained.
:::
::::

> [!IMPORTANT]
> **Count the colons.** A block that holds other blocks needs **one more colon** than the blocks
> inside it. That is why `cards` has four colons and each `card` has three.

## Tabs

The same thing written several ways, such as instructions for two operating systems.

````md
::::tabs
:::tab{title="Mac"}
Press **⌘ K**.
:::
:::tab{title="Windows"}
Press **Ctrl K**.
:::
::::
````

::::tabs
:::tab{title="Mac"}
Press **⌘ K**.
:::
:::tab{title="Windows"}
Press **Ctrl K**.
:::
::::

Click a tab, or use the arrow keys once a tab has focus. If a reader's browser runs no scripts,
every tab simply shows, one under the other.

## Steps

Numbered steps down a line. Each `###` heading inside becomes one step.

```md
:::steps
### Open the page

Go to Settings.

### Press Save

That is all.
:::
```

:::steps
### Open the page

Go to Settings.

### Press Save

That is all.
:::

## Accordions

A heading that folds open on click. Good for details most readers can skip.

```md
:::accordion{title="Why does this work?"}
Because the explanation lives here.
:::
```

:::accordion{title="Why does this work?"}
Because the explanation lives here.
:::

## Images

Press **Insert image** in the editor and pick a file. The app uploads it and puts the right line
in your text at the cursor, such as `![diagram](/api/doc-image/…)`.

- Allowed types: PNG, JPEG, WebP, GIF and AVIF, up to 5 MB each. SVG is refused.
- An image is only shown to readers who may read the page it is on.

## Code

Fence code with three backticks and name the language. Readers get colour highlighting and a
**Copy** button.

```ts
const greeting = "hello";
console.log(greeting);
```

## Tables

```md
| Name | Role |
|---|---|
| Sami | Super admin |
```

| Name | Role |
|---|---|
| Sami | Super admin |

## Good to know

:::accordion{title="Raw HTML is ignored"}
Typing HTML such as `<b>` or `<script>` does nothing; it is dropped. That is on purpose: whatever
an author writes runs in every reader's browser, so only the blocks on this page are allowed.
:::

:::accordion{title="Links"}
Links may be `https`, `http`, `mailto` or a path inside the site. A link that leaves the site is
marked so the other site cannot see where the reader came from.
:::
