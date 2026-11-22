---
title: Theming
description: Why a theme is two attributes rather than a provider or a compound key, what colorScheme actually fixes, and why a dark-only palette needs resolveMode.
---

# `ThemeRegistry`, `ModeRegistry`, `FontRegistry`

Appearance is **attributes on `<html>`** — not a context provider, class strategy or component variants.

```ts
root.dataset.theme = "ocean";              // ThemeRegistry.apply
root.dataset.mode = "dark";                // ModeRegistry.apply
root.style.colorScheme = "dark";           // …and this, which people leave out
```

Downstream is custom properties resolving differently: nothing subscribes or re-renders, and a theme is one
`color/` file plus one registry entry.

## Two attributes, not one key

The flat union this package started with (`light`, `dark`, `ocean-light`, `ocean-dark`) breaks with
palettes: it grows *n × m*, "has a light variant?" becomes string surgery, toggling computes a sibling
key, and `colorScheme` set from the key is valid only while every key happens to be a `color-scheme`
value. Two attributes keep the axes independent:

```css
[data-theme="ocean"][data-mode="light"] { … }
[data-theme="ocean"][data-mode="dark"]  { … }
[data-theme="midnight"][data-mode="dark"] { … }   /* dark only, and nothing is missing */
```

A mode toggle keeps the palette and vice versa; `ThemeMeta.modes` records which blocks a palette ships,
as data.

## How Tailwind reads the attributes

[`tailwind.css`](../../src/style/tailwind.css) maps the twelve to Tailwind colours with
`@theme inline` — `inline` makes `bg-surface` compile to `var(--surface)`, so a swap on `<html>` or in a
`ThemeScope` repaints with no rebuild. `dark:` is declared `&:where([data-mode="dark"], [data-mode="dark"] *)`,
following `data-mode` including nested scopes; components rarely need it.

## `resolveMode` is not a nicety

```ts
ThemeRegistry.resolveMode("midnight", "light"); // "dark"
```

A dark-only palette asked for light matches **no selector**: all twelve resolve to nothing, unstyled
text on white. Every `(theme, mode)` source — the server cookie read, the browser picker — goes through
`resolveMode`. `color/slate.css` closes the second cause:

```css
:root,
[data-theme="slate"][data-mode="light"] { … }
```

A document with no attributes (pre-hydration, no cookie) still resolves all twelve; `:root` at
`(0,1,0)` never beats a theme block at `(0,2,0)`.

## `colorScheme` is the line people leave out

```ts
root.style.colorScheme = "dark";
```

The attributes style *your* markup; `colorScheme` restyles **the browser's** — scrollbars, date
pickers, form chrome, the `<dialog>` backdrop. Without it a dark theme gets light scrollbars and a white
date picker, hard to attribute. It lives on `ModeRegistry` because it belongs to the **mode**, making
`style.colorScheme = "ocean-dark"` impossible.

## What the alternatives cost

- **A React context** re-renders the tree on switch and cannot style before hydration (the flash).
- **Class names** (`.theme-dark .button`) double every rule per theme with growing specificity; custom
  properties write the rule once and vary the value.
- **Per-theme component variants** make each theme a pass over every component.

## `system` is a preference, never a mode

```ts
ModeRegistry.resolve(preference, prefersDark);   // "system" + true -> "dark"
```

`ModePreference` is stored; `ModeKey` renders; nothing styles `system`. `resolve` takes a **boolean**,
never `matchMedia` (as `Locales.negotiate` takes strings, not `navigator`): the server reads the
`Sec-CH-Prefers-Color-Scheme` hint and the browser the media query, so the registry cannot own that
precedence.

## Apply it before the first byte, not before hydration

A `<head>` script reading `localStorage` works but renders themeless HTML and corrects it. `apps/web`
reads a cookie on the server and renders `data-theme`, `data-mode` and `color-scheme` into the HTML, so
**the first painted byte is correct**. The surviving inline script covers only `system` with no client
hint, and only upgrades light to dark — it cannot fight an explicit choice or strand a dark-only
palette. Both `apply` methods take an `HTMLElement` and touch nothing else (no React, no module-init
effects), so that script can call them.

## Font choice is a token override, not a third axis

```ts
public static apply(root: HTMLElement, key: FontKey): void {
  root.style.setProperty("--font-sans", FONTS[key].stack);
}
```

Another attribute (`light-serif`, `ocean-dark-mono`) would multiply *n × m × k*; overriding the
property keeps face and colour independent. **Each face carries its whole stack**
(`'"Inter", system-ui, sans-serif'`) — split, a component may reassemble it and silently fall back on one
platform.

## Every guard uses `Object.hasOwn`

```ts
public static isKnown(value: string): value is ThemeKey {
  return Object.hasOwn(THEMES, value);
}
```

Not `in`, which walks the prototype: `isKnown("toString")` would narrow to `ThemeKey` and `meta()`
return a function. These guards take untrusted strings (cookie, `localStorage`, query param) — the
permission catalog's defect class ([`permissions`](../../../permissions/docs/index.md)) — so every spec
pins `"toString"` and `"constructor"`.

## What is deliberately not here

**No persistence** — where a preference lives differs per host (the desktop shell has no cookie), so
`apps/web` owns it in `appearance-store.ts`. **No OS read** (see `resolve`). A per-user preference would
be a column beside the locale ([`content`](../../../content/docs/index.md)), read on every first server
render.
