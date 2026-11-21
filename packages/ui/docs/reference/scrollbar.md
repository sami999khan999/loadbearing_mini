---
title: Scrollbar
description: PageScrollbar — the glass overlay for the page and the themed thin bar for every inner scroller, coloured only from the twelve tokens, and why it needs themeScope.
---

# Scrollbar

`PageScrollbar` is mounted once, in `apps/web/src/route/__root.tsx`. It wraps `GlassScroll` from
[`glass-scroll`](https://github.com/sami999khan999/glass_scroll) with `scope="all"`.

| Where | What draws the bar |
|---|---|
| The page | A glass overlay positioned by script. It takes no layout width, so nothing shifts when a page grows a scrollbar. |
| Every inner scroller: the doc sidebar, menus, code blocks, tables, text areas | The browser's own bar, thinned and coloured to match by CSS. |

## Colours come from the twelve

Four `color-mix()` values over `--fg-muted`, `--fg` and `--bg` plus a `transparent` track — no literal,
so §32 holds and every theme and mode follows. **No dark palette:** the tokens already change with
`data-mode`, so `colorScheme` is `"light"`.

## Why `themeScope="[data-theme]"`

A custom property's `var()`s resolve where it is declared, so declared only on `:root` it ignores a
`ThemeScope` like the doc reader's — a plum-light space in a graphite-dark page kept pale-grey bars.
`themeScope="[data-theme]"` (added to the package in 0.2.0 for this) re-declares them on every
`data-theme` element, so each scroller takes its nearest scope.

## Opting an element out

| Selector | Effect |
|---|---|
| `.no-glass` or `data-glass-scroll="off"` | keeps the browser's default bar |
| `.no-scrollbar` or `data-glass-scroll="hidden"` | hides the bar completely, for carousels and tab strips |

Reduced motion turns the fades off, and forced-colours mode puts the system bar back.
