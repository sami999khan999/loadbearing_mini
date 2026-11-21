---
title: Documentation primitives
description: Sidebar, NavTree, Menu, CommandDialog, Card, Prose, CodeBlock, Toc, ThemeToggle and ReaderLayout — and the exact HTML the Markdown renderer must emit for Prose to style it.
---

# Documentation primitives

The reader's components; none knows what a page, space or search index is — `feature`'s docs slice
composes them and passes every string in.

| Export | What it is |
|---|---|
| `Sidebar` | A sticky column. Below `64rem` it becomes a modal drawer that traps focus, controlled by `open` and `onOpenChange` |
| `NavTree` | Collapsible sections and pages, one active leaf. A section starts open; one the reader closes stays closed for the session (`sessionStorage`, read after mount so the server and first paint agree). A closed branch renders nothing, so a 2,000-page space does not hydrate every page. The caller builds each link through `renderLink` |
| `Menu` | A listbox select that shows an icon and a second line. It is the space switcher |
| `CommandDialog`, `SearchTrigger`, `useHotkey` | The Ctrl K palette, the field that opens it, and the key binding |
| `Card`, `CardGrid` | A card that is one whole link, and the grid of them |
| `Prose` | Sanitised server HTML styled as an article. Each code block gets a copy button |
| `MarkdownText` | Untrusted Markdown rendered in the browser, such as a streaming assistant answer. `react-markdown` with GFM and `rehype-sanitize`; raw HTML is dropped and a script link stripped. Same `ui-prose` styles |
| `CodeBlock` | The same code frame, for code composed in React |
| `Toc` | "On this page", with the heading under the reader marked |
| `ThemeToggle` | Light and dark as a radio pair. A mode the palette lacks is disabled |
| `ReaderLayout` | The page around them: sidebar, article, outline, and a top bar on a phone |

## Links stay the caller's

`NavTree`, `CommandDialog` and `Card` never render the router's `<Link>`; they call
`renderLink(item, content, attributes)`, and `attributes` (`{ className, "aria-current"? }`) must be
spread onto the caller's element — it carries style and active state.

## `CommandDialog` is not the hand-rolled Dialog

It uses native `<dialog>` and `showModal()` — the browser supplies focus trap, inert background,
Escape and top layer (the headless primitive the [index](../index.md) asks for). The input keeps focus;
arrows move `aria-activedescendant`, and Enter clicks the active option's anchor so the caller's router
navigates.

## The server HTML contract

`Prose` trusts its `html` prop, so **the HTML must come from the renderer's sanitiser**, which keeps only
these shapes, each styled by one stylesheet whether from Markdown or React:

| Markdown | HTML the renderer must emit | Styled by |
|---|---|---|
| `## Heading` | `<h2 id="slug">…</h2>` (h1–h4) | `prose.css`. The `id` is what `Toc` links and observes |
| A fenced code block | `<pre><code class="hljs language-ts">…</code></pre>`, with highlight.js `hljs-*` spans inside | `code-block.css` |
| `> [!NOTE]` / `[!TIP]` / `[!IMPORTANT]` / `[!WARNING]` / `[!CAUTION]` | `<div class="ui-callout ui-callout--info\|success\|warning\|danger"><div class="ui-callout__body">…</div></div>`, with no title: the word would be English in every locale, and the tone already says it | `callout.css`, the same markup `Callout` renders |
| `:::cards` | `<div class="ui-card-grid">…</div>` | `card.css` |
| A card with a link | `<a class="ui-card" href="…"><span class="ui-card__title">T</span><span class="ui-card__description">D</span></a>` | `card.css` |
| A card without a link | `<div class="ui-card">…same spans…</div>` | `card.css` |

`NOTE` → `info`, `TIP` → `success`, `IMPORTANT` → `info`, `WARNING` → `warning`, `CAUTION` → `danger`.
Server cards have no `ui-card__icon` (a `<use>` needs the bundle's sprite URL). After mount `Prose` wraps
each `pre` in `<div class="ui-code-block">` with a copy button; one article-level handler copies the
`pre`'s text, never the label.

## Code colours are four of the twelve

Highlight tokens use `--primary`, `--danger`, `--fg` and `--fg-muted` plus italic and weight, moving with
the theme. Code sits on `--surface`, not `--muted`, where several themes put `--primary`/`--danger` under
4.5:1 ([`check-contrast.mjs`](../../../../tooling/scripts/check-contrast.mjs) asserts `--surface`).
`--success`/`--warning` are never text — a diff's added line is a tinted fill. Likewise the active nav
pill is a `--primary` tint with `--fg` text, since text on a `color-mix` is uncheckable.
