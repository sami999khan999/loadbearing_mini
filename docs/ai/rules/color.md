---
title: Colour
description: Every colour is one of the twelve custom properties, read as var(). The one file allowed to write a literal, how to derive a state, and why a hex passes every other check.
---

# Colour

- **Every colour is `var(--<name>)`, from the twelve `packages/ui` declares. Nothing else is a
  colour.**

  ```css
  --bg  --surface  --muted  --border  --fg  --fg-muted
  --primary  --primary-fg  --success  --warning  --danger  --ring
  ```

  A hex, `rgb()`, `hsl()`, colour keyword or bare `oklch()` outside `packages/ui/src/style/color/`
  compiles, lints and reviews clean, and is wrong in five of six themes and every dark mode.
- **Only `src/style/color/<theme>.css` writes a themed colour** — one file per theme, all twelve,
  once per mode. That is adding a theme, never how a colour reaches a component.
  `src/style/markdown/*.css` and `base.css` use `var()` only.
- **Two exceptions, not precedents.** `style/token.css` writes `oklch(0 0 0 / <alpha>)` for shadows.
  `packages/composition/src/mail/mail-layout.ts` writes frozen inline sRGB hexes (slate-light),
  because mail clients resolve no custom property — `var(--primary)` in an email renders nothing.
- **In a component, use Tailwind utilities of the twelve** — `bg-surface`, `text-fg-muted`,
  `border-border` — from `packages/ui/src/style/tailwind.css`, which resets the palette so
  `bg-red-500` generates nothing. A derived state mixes two:
  `bg-[color-mix(in_oklab,var(--primary)_88%,var(--fg))]`. `text-[#fff]` is wrong in every theme.
- **Derive states, never name them** — no `--primary-hover`; use
  `color-mix(in oklab, var(--primary) 88%, var(--fg))`.
- **Mix `in oklab`, never `in oklch`** — oklch interpolates hue (14% green into a hue-260 surface
  lands blue).
- **Components take a semantic tone, never a colour:** `<StatusBadge tone="danger">`, not a `color`
  prop or `style={{ color }}`. Components carry `ui-*` class hooks.
- **Icons paint with `currentColor`** — set `color` on an ancestor.
- **`--success` and `--warning` are fills, not text** (3.5:1 and 2.6:1 on `--bg`); tint them into
  `--surface` as `StatusBadge` does. `--danger` is the only status colour that passes AA as text.

**Checked twice:** `pnpm check:contrast` (WCAG AA over 154 pairings, sRGB gamut, missing names) and
`check-architecture` §32 (a colour outside the twelve in a class, `style` prop or stylesheet).
Neither sees a colour built at runtime.

Argument: [`packages/ui/docs/reference/palette.md`](../../../packages/ui/docs/reference/palette.md)
(the twelve, the gamut trap, adding a theme) and
[`packages/ui/docs/reference/theming.md`](../../../packages/ui/docs/reference/theming.md)
(two attributes, `resolveMode`, `colorScheme`). Those pages win on conflict.
