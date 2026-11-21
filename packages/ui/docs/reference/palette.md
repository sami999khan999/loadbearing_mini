---
title: Palette
description: The twelve colour names every theme declares, why they are oklch, the sRGB gamut trap that makes a chroma lie, and the four steps that add a theme.
---

# Palettes

A theme is **one file in `src/style/color/`** declaring twelve names, once per mode — no components,
nothing structural.

## The twelve

| Name | What it is |
|---|---|
| `--bg` | the page |
| `--surface` | cards, popovers, modals |
| `--muted` | subtle fills, hover, inputs |
| `--border` | every hairline |
| `--fg` | primary text |
| `--fg-muted` | secondary text, placeholders |
| `--primary` | the brand fill |
| `--primary-fg` | text that sits on `--primary` |
| `--success` · `--warning` · `--danger` | status |
| `--ring` | the focus ring |

**Every theme declares all twelve.** An omitted one does not default — it silently inherits `slate`'s
`:root` seed, another theme's colour in the right slot — so `check-contrast.mjs` fails on a missing name.

## Why `oklch()`

OKLCH lightness tracks perceived lightness, so holding `L` and moving `H` gives a theme of the same
weight — `ocean`, `forest` and `plum` are `slate`'s ladder at another hue, inheriting its contrast. It
also makes derived states honest: no `--primary-hover`, since
`color-mix(in oklab, var(--primary) 88%, var(--fg))` darkens by an even step everywhere (tokens in
OKLCH, mixes in OKLab — the same space in rectangular coordinates). Twelve names fit in a head; twelve
plus hover and active each do not.

## The gamut trap

**sRGB does not hold the same chroma at every hue, and the browser clips silently** — the screen
colour is not the file's, and contrast computed from the file is wrong. At `L 0.54`:

| Hue | | Max chroma in sRGB |
|---|---|---|
| 260 | blue | **0.228** |
| 330 | magenta | 0.253 |
| 155 | green | 0.137 |
| 210 | azure | **0.094** |

`ocean` has a third of `slate`'s chroma because that is what the hue holds — asking for more clips to
something duller nobody chose. `check-contrast.mjs` converts every value to linear sRGB **without
clamping** and fails a channel outside `[0, 1]`; it caught three colours on its first run.

## Mix in `oklab`, never `oklch`

**Every `color-mix()` is `in oklab`.** `in oklch` interpolates hue numerically, and a near-grey still
has one: dark `--surface` is `oklch(0.21 0.009 260)`, so a 14% success tint lands at hue 245 — a blue
"success" badge; a 32% warning border over slate-light `--border` came out magenta (316). `oklab` mixes
`a`/`b`, so a near-zero-chroma base barely moves the result: across all six themes and modes a 14% tint
stays within 38° of its hue (worst: midnight's success), where `oklch` strays up to 270°.

Light `--surface` is `oklch(1 0 none)`. `none` mattered under `oklch` (`0` would pull tints toward red);
under `oklab` both mix identically, but write greys as `none` — honest, and read as `0` by
`check-contrast.mjs`, correct since chroma is zero. Mixes into `transparent` (no hue, no alpha) are
`in oklab` too, so one spelling needs no judgement.

## Contrast is checked, not reviewed

`pnpm check:contrast` runs in CI after `check:architecture`, asserting WCAG AA over the 154 pairings
components produce across six themes. Before authoring one:

- **`--fg-muted` is bounded by `--muted`, not `--bg`** — a placeholder sits in an input, the tightest
  pairing, which fixes light `--fg-muted` at `L 0.535`.
- **`--success` and `--warning` are not text-safe on `--bg`** (3.5:1, 2.6:1). They are fills;
  `StatusBadge` tints them into `--surface` with `--fg` text. Only `--danger` passes AA as text — hence
  the field error is the one status-coloured foreground.

## Adding a theme

Four steps, no component touched:

1. **`src/style/color/<name>.css`** — one block per mode, all twelve. Copy `slate.css` and rotate the
   hue; keep the lightness ladder.
2. **`src/style/index.css`** — one `@import` with the other colour files, above every rule (Vite
   inlines it).
3. **`src/theme/theme-registry.ts`** — a `THEMES` entry with a `label` and only the `modes` you wrote;
   `resolveMode` trusts this list, and a phantom mode leaves all twelve undefined.
4. **`tests/theme/theme-registry.spec.ts`** — its `all()` assertion names every key and fails until
   yours is added: the one check of CSS against registry.

Then run `pnpm check:contrast`, and open `/kitchen-sink` in `apps/web` to look at it.

## Cost

Six themes, eleven mode blocks, 132 colours: **5.0 KB raw, 0.7 KB gzipped**, compiled into the app's
one Tailwind stylesheet, so no request of its own. Every theme ships to every user — lazy loading costs a
round trip and a flash exactly when someone is looking at colours; unmatched blocks cost parse time
only. Revisit past forty themes.

## Mail is outside the palette, and has to be

`packages/composition/src/mail/mail-layout.ts` writes literal sRGB hexes — the second exemption in
[the colour rule](../../../../docs/ai/rules/color.md) — because **mail clients resolve no custom
property** (`var(--primary)` renders nothing) and most strip `<style>`, so values are inline. They are
slate-light in sRGB, not derived from `slate.css` at build time: a recipient has no theme or mode to
read. `check:contrast` reads only `packages/ui/src/style/color/*.css`, so mail's pairings (white on
primary, `--fg` on `--surface`, both AA) are a review item, not a gate.
