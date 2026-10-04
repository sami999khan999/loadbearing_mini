---
title: UI (the design system)
description: The design system: components, the twelve colours, six themes and every stylesheet.
---

# UI (the design system)

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The visual building blocks: buttons, fields, dialogs, tables, the docs sidebar tree, the search palette, the article renderer, the theme system and every stylesheet. Built with React, Tailwind and Base UI.

Every colour is one of twelve named tokens, and six themes (slate, forest, graphite, midnight, ocean, plum) each define those twelve for light and dark. A component takes a tone ("danger"), never a colour. No text lives here: every string arrives as a prop.

| | |
|---|---|
| Folder | `packages/ui/` |
| Files | 127 |
| Uses | [Assets](asset.md), [Permissions](permissions.md) |
| Used by | [Feature (the screens' building blocks)](feature.md), [The web app](app-web.md) |

## Every file

### `packages/ui/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `ui.d.ts` | Tells TypeScript that importing the icon sprite gives a URL string. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |
| `vitest.setup.ts` | Runs before the tests: cleans up rendered components between tests. |

### `packages/ui/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/ui/src/class-name/`

| File | What it does |
|---|---|
| `class-name.ts` | `cn`: joins CSS class names and lets a caller's Tailwind class override the component's default when they conflict. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/button/`

| File | What it does |
|---|---|
| `button.tsx` | `Button` and `buttonClassName`: the button in its variants (primary, secondary, ghost, danger). Defaults to `type="button"` so it never submits a form by accident. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/callout/`

| File | What it does |
|---|---|
| `callout.tsx` | `Callout`: a coloured message box (info, success, warning, danger), announced politely to screen readers. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/can/`

| File | What it does |
|---|---|
| `can.tsx` | `Can`: shows its children only if the person holds a permission. A convenience for hiding buttons, never the real security check (the server checks again). |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/card/`

| File | What it does |
|---|---|
| `card.tsx` | `Card` and `CardGrid`: a clickable card with icon, title and text, and a grid of them. Same markup the Markdown `:::cards` block produces. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/code-block/`

| File | What it does |
|---|---|
| `code-block.tsx` | `CodeBlock`: a code block with a title and copy button, for code shown from React rather than from a doc page. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/code-list/`

| File | What it does |
|---|---|
| `code-list.tsx` | `CodeList`: a grid of short codes in monospace, used for two-factor backup codes. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/command-dialog/`

| File | What it does |
|---|---|
| `command-dialog.tsx` | `CommandDialog`: the search palette (Ctrl/Cmd+K): a dialog with a search field and grouped results you can move through with the keyboard. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `search-trigger.tsx` | `SearchTrigger`: a button that looks like a search field and shows the keyboard shortcut; clicking it opens the palette. |
| `use-hotkey.ts` | `useHotkey`: listens for Ctrl+K (Cmd+K on Mac) or another shortcut. |

### `packages/ui/src/component/data-table/`

| File | What it does |
|---|---|
| `data-table.tsx` | `DataTable`: a table with columns, clickable rows (by mouse or keyboard) and a loading skeleton. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/dialog/`

| File | What it does |
|---|---|
| `dialog.tsx` | `Dialog` and `AlertDialog`: a modal window, and a confirmation version for destructive actions that never confirms on Enter. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/empty-state/`

| File | What it does |
|---|---|
| `empty-state.tsx` | `EmptyState`: what a list shows when it has nothing in it, with an action to take. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/field/`

| File | What it does |
|---|---|
| `field.tsx` | `Field`: wraps a form control with its label, hint and error message, wired up so screen readers announce them. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/icon/`

| File | What it does |
|---|---|
| `icon.tsx` | `Icon`: draws an icon from the sprite in the current text colour. Hidden from screen readers unless given a label. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/component/input/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `input.tsx` | `Input`: the text input, styled to match the theme, showing an error state from its `Field`. |

### `packages/ui/src/component/menu/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `menu.tsx` | `Menu`: a dropdown of options with icons and a second line, for switchers in a sidebar. |

### `packages/ui/src/component/nav-tree/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `nav-tree.tsx` | `NavTree`: the docs sidebar tree: section headings, pages and outside links, with collapsible sections remembered for the session and the current page highlighted. |

### `packages/ui/src/component/page-scrollbar/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `page-scrollbar.tsx` | `PageScrollbar`: replaces the page's scrollbar with a themed glass overlay, and gives every inner scroller the same thin themed bar. |

### `packages/ui/src/component/popover/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `popover.tsx` | `Popover`: a button that opens a floating panel (for example the notification bell). The panel's content only mounts while open. |

### `packages/ui/src/component/prose/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `prose.tsx` | `Prose`: shows a published doc page's HTML styled as an article, and after it loads adds copy buttons to code blocks, turns tab blocks into working tabs and fills in card icons. |

### `packages/ui/src/component/qr-code/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `qr-code.tsx` | `QrCode`: draws a QR code as SVG, used to set up two-factor in an authenticator app. |

### `packages/ui/src/component/reader-layout/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `reader-layout.tsx` | `ReaderLayout`: the three-column docs layout: sidebar, article, and "On this page", collapsing on narrow screens. |

### `packages/ui/src/component/scroll-area/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `scroll-area.tsx` | `ScrollArea`: a scrollable region with the themed thin scrollbar. |

### `packages/ui/src/component/select/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `select.tsx` | `Select`: a dropdown select that works in forms (a field style and a taller menu style). |

### `packages/ui/src/component/sidebar/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `sidebar.tsx` | `Sidebar`: a side panel that is always shown on wide screens and slides in over a backdrop on narrow ones. |

### `packages/ui/src/component/status-badge/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `status-badge.tsx` | `StatusBadge`: a small coloured label (success, warning, danger, neutral), tinted so the text stays readable. |

### `packages/ui/src/component/textarea/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `textarea.tsx` | `Textarea`: the multi-line text input. |

### `packages/ui/src/component/theme-toggle/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `theme-toggle.tsx` | `ThemeToggle`: the light/dark switch, disabled for a dark-only theme. |

### `packages/ui/src/component/toc/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `toc.tsx` | `Toc`: the "On this page" list of headings, highlighting the one you are reading. |

### `packages/ui/src/component/tooltip/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `tooltip.tsx` | `Tooltip`: a hint shown on hover and focus. |

### `packages/ui/src/format/`

| File | What it does |
|---|---|
| `byte-format.ts` | `ByteFormat`: shows a byte count as "1.5 MB". |
| `date-format.ts` | `DateFormat`: shows a date as `YYYY-MM-DD` in UTC, the same on server and browser. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/ui/src/style/`

| File | What it does |
|---|---|
| `base.css` | Base styles for the whole page: body colours, fonts, focus ring, selection. |
| `index.css` | The stylesheet entry point: pulls in Tailwind, the tokens, the themes, the base styles and the Markdown styles. |
| `tailwind.css` | Tailwind settings: removes Tailwind's own colours and replaces them with the twelve theme colours, so only theme colours can be used. |
| `token.css` | Design tokens that are not colours: spacing, radii, font sizes, shadows, motion. |

### `packages/ui/src/style/color/`

| File | What it does |
|---|---|
| `forest.css` | The "forest" theme: the twelve colours, for light and dark. |
| `graphite.css` | The "graphite" theme: the twelve colours, for light and dark. |
| `midnight.css` | The "midnight" theme: the twelve colours, dark only. |
| `ocean.css` | The "ocean" theme: the twelve colours, for light and dark. |
| `plum.css` | The "plum" theme: the twelve colours, for light and dark. |
| `slate.css` | The "slate" theme (the default): the twelve colours, for light and dark. |

### `packages/ui/src/style/markdown/`

| File | What it does |
|---|---|
| `blocks.css` | Styles for the doc blocks: tabs, steps and accordions. |
| `callout.css` | Styles for callouts in doc pages. |
| `card.css` | Styles for cards in doc pages. |
| `code-block.css` | Styles for code blocks and syntax highlighting in doc pages. |
| `prose.css` | Styles for doc page text: headings, paragraphs, lists, tables, links, images. |

### `packages/ui/src/theme/`

| File | What it does |
|---|---|
| `font-registry.ts` | `FontRegistry`: the font choices (sans, serif, mono) a reader can pick. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `mode-registry.ts` | `ModeRegistry`: light, dark or "follow the system", and resolving the stored preference safely. |
| `theme-registry.ts` | `ThemeRegistry`: the six themes and which modes each supports. |
| `theme-scope.tsx` | `ThemeScope`: applies a different theme to one part of the page (for example a doc space with its own theme), including popups opened inside it. |

### `packages/ui/tests/class-name/`

| File | What it does |
|---|---|
| `class-name.spec.ts` | Tests `class-name.ts`. |

### `packages/ui/tests/component/callout/`

| File | What it does |
|---|---|
| `callout.spec.tsx` | Tests `callout.tsx`. |

### `packages/ui/tests/component/can/`

| File | What it does |
|---|---|
| `can.spec.tsx` | Tests `can.tsx`. |

### `packages/ui/tests/component/card/`

| File | What it does |
|---|---|
| `card.spec.tsx` | Tests `card.tsx`. |

### `packages/ui/tests/component/code-block/`

| File | What it does |
|---|---|
| `code-block.spec.tsx` | Tests `code-block.tsx`. |

### `packages/ui/tests/component/command-dialog/`

| File | What it does |
|---|---|
| `command-dialog.spec.tsx` | Tests `command-dialog.tsx`. |

### `packages/ui/tests/component/data-table/`

| File | What it does |
|---|---|
| `data-table.spec.tsx` | Tests `data-table.tsx`. |

### `packages/ui/tests/component/dialog/`

| File | What it does |
|---|---|
| `dialog.spec.tsx` | Tests `dialog.tsx`. |

### `packages/ui/tests/component/empty-state/`

| File | What it does |
|---|---|
| `empty-state.spec.tsx` | Tests `empty-state.tsx`. |

### `packages/ui/tests/component/field/`

| File | What it does |
|---|---|
| `field.spec.tsx` | Tests `field.tsx`. |

### `packages/ui/tests/component/icon/`

| File | What it does |
|---|---|
| `icon.spec.tsx` | Tests `icon.tsx`. |

### `packages/ui/tests/component/menu/`

| File | What it does |
|---|---|
| `menu.spec.tsx` | Tests `menu.tsx`. |

### `packages/ui/tests/component/nav-tree/`

| File | What it does |
|---|---|
| `nav-tree.spec.tsx` | Tests `nav-tree.tsx`. |

### `packages/ui/tests/component/popover/`

| File | What it does |
|---|---|
| `popover.spec.tsx` | Tests `popover.tsx`. |

### `packages/ui/tests/component/prose/`

| File | What it does |
|---|---|
| `prose.spec.tsx` | Tests `prose.tsx`. |

### `packages/ui/tests/component/qr-code/`

| File | What it does |
|---|---|
| `qr-code.spec.tsx` | Tests `qr-code.tsx`. |

### `packages/ui/tests/component/scroll-area/`

| File | What it does |
|---|---|
| `scroll-area.spec.tsx` | Tests `scroll-area.tsx`. |

### `packages/ui/tests/component/select/`

| File | What it does |
|---|---|
| `select.spec.tsx` | Tests `select.tsx`. |

### `packages/ui/tests/component/sidebar/`

| File | What it does |
|---|---|
| `sidebar.spec.tsx` | Tests `sidebar.tsx`. |

### `packages/ui/tests/component/status-badge/`

| File | What it does |
|---|---|
| `status-badge.spec.tsx` | Tests `status-badge.tsx`. |

### `packages/ui/tests/component/theme-toggle/`

| File | What it does |
|---|---|
| `theme-toggle.spec.tsx` | Tests `theme-toggle.tsx`. |

### `packages/ui/tests/component/toc/`

| File | What it does |
|---|---|
| `toc.spec.tsx` | Tests `toc.tsx`. |

### `packages/ui/tests/component/tooltip/`

| File | What it does |
|---|---|
| `tooltip.spec.tsx` | Tests `tooltip.tsx`. |

### `packages/ui/tests/format/`

| File | What it does |
|---|---|
| `byte-format.spec.ts` | Tests `byte-format.ts`. |

### `packages/ui/tests/theme/`

| File | What it does |
|---|---|
| `mode-registry.spec.ts` | Tests `mode-registry.ts`. |
| `theme-registry.spec.ts` | Tests `theme-registry.ts`. |
| `theme-scope.spec.tsx` | Tests `theme-scope.tsx`. |

### `packages/ui/docs/`

| File | What it does |
|---|---|
| `index.md` | The design system — structural tokens, themes as custom properties, and components that take props and nothing else. No domain nouns, no router, no cache. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/ui/docs/reference/`

| File | What it does |
|---|---|
| `docs-primitives.md` | Sidebar, NavTree, Menu, CommandDialog, Card, Prose, CodeBlock, Toc, ThemeToggle and ReaderLayout — and the exact HTML the Markdown renderer must emit for Prose to style it. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `palette.md` | The twelve colour names every theme declares, why they are oklch, the sRGB gamut trap that makes a chroma lie, and the four steps that add a theme. |
| `popover.md` | A panel anchored to the control that opened it, on Base UI — what it keeps from the hand-rolled version, what it deliberately is not, and the two behaviours that changed. |
| `scrollbar.md` | PageScrollbar — the glass overlay for the page and the themed thin bar for every inner scroller, coloured only from the twelve tokens, and why it needs themeScope. |
| `theming.md` | Why a theme is two attributes rather than a provider or a compound key, what colorScheme actually fixes, and why a dark-only palette needs resolveMode. |
