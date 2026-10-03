## Copy Markdown

The **Copy Markdown** button under the title copies the page's source text, ready to paste into an
email, a ticket or an AI chat. The button says **Copied** for a moment.

## The Open menu

The **Open** button next to it offers what this page allows:

| Item | Shown when |
|---|---|
| **View as Markdown** | the page is in a **public** space and has no access link, on itself or above it |
| **Open in ChatGPT** | the same as above |
| **Open in Claude** | the same as above |
| **Edit this page** | you may edit it (`doc.page.write` in the organization that owns it) |

"Open in ChatGPT" and "Open in Claude" start a new chat that asks the tool to read the page's
Markdown address, so you can ask questions about it.

> [!IMPORTANT]
> **Why only public pages?** ChatGPT and Claude fetch the page themselves, as a visitor who is not
> signed in. A private page answers them "not found", so offering the link would only produce a
> broken answer. On organization docs (`/doc`) these items never appear.

## The GitHub link

If a space has a **Repository URL**, a GitHub icon labelled **Source repository** appears at the
bottom of the sidebar. Set the URL in the space's settings; it must start with `https://`. Leave it
empty for no icon.

## Themes and light or dark

At the bottom of the sidebar:

- **Theme** picks one of six colour palettes: Slate, Ocean, Forest, Plum, Midnight and Graphite.
- **Colour mode** switches **Light** and **Dark**. A mode the theme does not have is greyed out;
  Midnight, for example, is dark only.

A space can open in a theme of its own, set by **Opens in theme** in the space settings. Once a
reader picks a theme themselves, their choice wins.

## llms.txt and raw Markdown, for AI tools

- **`/llms.txt`** is a list of every public page, in a format AI agents read. It is refreshed
  every five minutes.
- **`/api/doc/<space>/<page>`** returns one public page as plain Markdown. A space's first page is
  `/api/doc/<space>/index`.

Both show only public pages with no access link. This guide is not public, so it is in neither.
