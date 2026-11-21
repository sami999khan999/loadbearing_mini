---
title: The doc renderer
description: Markdown to sanitised HTML with unified — the pipeline order and why it matters, what the sanitiser lets through, every directive an author can write, re-rendering after a version bump, and the type stub that keeps the DOM out of this package.
---

# The doc renderer

`UnifiedMarkdownRenderer` turns Markdown into reader HTML, once per publish or preview, never per read.
**Whatever it lets through runs in every member's browser with their session**, and nothing downstream
sanitises again — so safety comes first.

## The pipeline, in order

| Step | Plugin | Why it sits where it does |
|---|---|---|
| 1 | `remark-parse`, `remark-gfm` | Markdown and GitHub's tables, task lists and footnotes |
| 2 | `remark-directive` | Cards, tabs, steps and accordions — the `:::` blocks below |
| 3 | our `blocks` transform | GitHub alerts become callouts, and each directive becomes its `ui-*` markup |
| 4 | `remark-rehype` | Raw HTML is **off**: a `<script>` in the Markdown never becomes a node |
| 5 | `rehype-sanitize` | The allow-list. Everything above it is untrusted |
| 6 | `rehype-slug` | Heading ids. After the sanitiser, which would otherwise prefix them `user-content-` |
| 7 | our `links` transform | `rel="nofollow noopener noreferrer"` on every link that leaves the site |
| 8 | `rehype-highlight` | `hljs-*` classes on code. After the sanitiser, so the classes survive |

**Steps 6–8 follow the sanitiser on purpose:** what they add is ours, not the author's.

## What the sanitiser allows

GitHub's schema plus a `ui-*` `class` on `div`, `span`, `p`, `a`, `details`, `summary` (the `blocks`
hooks) and a kebab-case `data-icon` on `div`/`a` (a sprite name `Prose` resolves) —
[`docs-primitives.md`](../../../ui/docs/reference/docs-primitives.md). Authors cannot forge them: raw HTML
never arrives and directive attributes are dropped. URLs: `http`, `https`, `mailto`, relative; a card's
`href` is re-checked, since directive attributes bypass the sanitiser.

## Writing each block

Each is a `remark-directive` container; the outer fence needs **one more colon than any inside it**.

| Write | Get |
|---|---|
| `> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` | A callout in that tone |
| `::::cards` around `:::card{title="…" href="…" icon="…"}` | A grid of link cards. `icon` is a sprite name; an unknown one shows no icon |
| `::::tabs` around `:::tab{title="…"}` | Tabs. With no script every panel shows, stacked under its title |
| `:::steps` around `###` headings, one per step | Each heading numbered, on a rail down the left |
| `:::accordion{title="…"}` | A `<details>` that opens on click, with no script at all |

```md
::::tabs
:::tab{title="pnpm"}
`pnpm add @loadbearing/ui`
:::
:::tab{title="npm"}
`npm install @loadbearing/ui`
:::
::::
```

An unknown directive is restored as typed, so a typo shows in preview. **Tabs are plain HTML until
`Prose` mounts** and adds the `tablist`, hiding, and arrow/Home/End keys — nothing is lost without
script. **Callouts carry no title** ("Note" would be English in every locale; the tone says it).

## The type stub

`highlight.js`'s types carry `/// <reference lib="dom" />`, which puts DOM `ReadableStream` and
`BufferSource` over Node's across the **whole package** (it surfaced as unrelated type errors, including
in the S3 gateway). So `tsconfig.json` maps `highlight.js` to the root `highlight-js.d.ts`, declaring only
`LanguageFn`, which `lowlight` imports; the runtime import is unchanged.

**Remove the stub only after checking that highlight.js no longer references the DOM lib.**

## Changing the markup

`version` is stored as `doc_pages.renderer_version`; bump it when emitted HTML or search text changes.
It is **3**:

| Version | Changed |
|---|---|
| 1 | Callouts and cards |
| 2 | Tabs, steps, accordions and card icons |
| 3 | Section text keeps blocks apart, so a card's title and description stay two words |

Then **`pnpm doc:rerender`** with the worker up: one `doc-rerender` job per organization on the
maintenance queue; `DocRerender` re-renders older pages 50 at a time — HTML, outline, `renderer_version`
and search sections (title first) change; **revision, draft and publish time do not**; the cached page
is forgotten explicitly (its revision key did not change). Rendering runs outside the transaction (CPU
work holding a connection); a job with work logs `doc.pages.rerendered` with the count.
