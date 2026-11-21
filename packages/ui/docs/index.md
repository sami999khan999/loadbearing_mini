---
title: "@loadbearing/ui"
description: The design system — structural tokens, themes as custom properties, and components that take props and nothing else. No domain nouns, no router, no cache.
---

# `@loadbearing/ui`

Two mechanical rules:

- **A domain noun in an export name means the wrong package.** `StatusBadge` and `DataTable` are here;
  wrappers that know the domain are `feature` — else restyling needs the domain and tests need fixtures.
- **A component needing the router belongs in `apps/web`.** Navigation arrives as `onNavigate` or `href`,
  so a Tauri shell can mount these under its own router.

| | |
| --- | --- |
| **Package** | `@loadbearing/ui` (private, never published) |
| **Entrypoint** | `src/index.ts` (opens with `"use client"`), plus `./style.css` |
| **Depends on** | `@loadbearing/asset`, the only runtime workspace dependency; `@base-ui/react` for behaviour, and `clsx` with `tailwind-merge` behind `cn` |
| **Type-only** | `@loadbearing/permissions`, a `devDependency` because both imports are erased |
| **Peers** | `react`, `react-dom` |
| **Used by** | `feature`, `apps/web` |

`grep -rn "@tanstack\|@loadbearing/query\|@loadbearing/contracts" packages/ui/src` returns nothing.

```
packages/ui/
├── ui.d.ts                    ← declare module "*.svg"; named in tsconfig `include`
├── vitest.setup.ts            ← afterEach(cleanup)
└── src/
    ├── index.ts               ← "use client" on line 1; re-exports the four groups below
    ├── import.ts              ← every outside module, written once
    ├── component/             ← every exported component, one folder each
    │   ├── index.ts           ← names every component export
    │   ├── button/ … tooltip/ ← 26 folders, each with its own index.ts
    ├── theme/                 ← TypeScript only
    │   ├── theme-registry.ts  → ThemeRegistry, ThemeKey, ThemeMeta
    │   ├── mode-registry.ts   → ModeRegistry, ModeKey, ModePreference
    │   ├── font-registry.ts   → FontRegistry, FontKey, FontMeta
    │   └── theme-scope.tsx    → ThemeScope, usePortalContainer
    ├── style/                 ← every stylesheet, and nothing else
    │   ├── index.css          ← the one entry, exported as `./style.css`
    │   ├── token.css          ← the sizes, as Tailwind theme blocks
    │   ├── color/*.css        ← one per theme; the twelve names, in oklch
    │   ├── tailwind.css       ← the twelve as Tailwind's palette; the `dark` variant
    │   ├── base.css           ← the page, the focus ring, the skip link
    │   └── markdown/*.css     ← callout, card, code-block, prose
    ├── class-name/            → cn
    └── format/                → DateFormat, ByteFormat
```

**Four groups:** `component/` (what callers render), `theme/` (choosing and scoping a theme), `style/`
(what no utility reaches), and the helpers `class-name/` and `format/` — the repo's third folder shape
([Folders](../../../docs/opinions/folders.md)).

## The stylesheets, and what each may reference

Components use Tailwind utilities; `style/` holds only what a utility cannot express, referencing one way:

| File | Holds | May reference |
|---|---|---|
| `token.css` | sizes — type, space, radius, shadow, motion | nothing |
| `color/*.css` | one file per theme; the twelve colour names | nothing |
| `tailwind.css` | the twelve as Tailwind colours, and `dark:` | `color/`, only as `var()` |
| `base.css`, `markdown/*.css` | the page, and HTML the Markdown renderer writes | the rest, only as `var()` |

`token.css` names no colour (**a dark theme is not a different spacing system**); colour files name no
component; `base.css` and `markdown/` declare no literals (§32). `markdown/` styles stored doc HTML
(`ui-callout`, `ui-card`, `ui-prose`) that React never renders. `style/index.css` is Tailwind source,
compiled through [`apps/web/src/style/app.css`](../../../apps/web/src/style/app.css) as
`@loadbearing/ui/style.css`; `base.css` and `markdown/` sit in the `components` layer, so a `className`
utility beats them.

## A theme and a mode are two axes

`<html data-theme="ocean" data-mode="dark">` — a mode toggle keeps the palette, and a one-mode palette
declares one block (`ThemeMeta.modes`).

## Twelve names, and every theme declares all twelve

```css
--bg  --surface  --muted  --border  --fg  --fg-muted
--primary  --primary-fg  --success  --warning  --danger  --ring
```

The set is the contract — an omitted name inherits another theme's colour from the `:root` seed. All
`oklch()`, so the other themes are slate's lightness ladder at another hue, chroma capped to sRGB
([Palette](reference/palette.md)). A theme is one CSS block and one registry entry, and `currentColor`
icons ([`asset`](../../asset/docs/index.md)) recolour with it.

**Applying a preference is two calls; the second is the one people forget:**

```ts
root.dataset.theme = key;   // ThemeRegistry.apply
root.dataset.mode = mode;   // ModeRegistry.apply, which also sets
root.style.colorScheme = mode;
```

Each registry moves only its axis. `colorScheme` is `ModeRegistry`'s — it themes native scrollbars,
controls and date pickers. Call both before hydration from an inline `<head>` script, or dark readers get a
white flash. **`resolveMode` exists because a palette may ship one mode:** `midnight` is `modes: ["dark"]`,
and an unmatched pair leaves every colour undefined. `FontRegistry` overrides `--font-sans` — a token, not a
theme, so face and colours stay independent. **Registries guard with `Object.hasOwn`, not `in`** (an
untrusted `"toString"` would return a function, the permission catalog's bug; specs pin it).

## `<Can>` is a convenience, never the gate

```tsx
<Can permission="rbac.role.read" capabilities={caps} fallback={null}>…</Can>
```

It calls the server's own `CapabilitySet.can()` — **one implementation**, the point of
[`permissions`](../../permissions/docs/index.md); a spec asserts it. Hiding is UX; `Authorizer.assert()`
is the check. **`goalId` is not a domain noun** — it forwards a permission scope id under `can()`'s own
parameter name; renaming it would hide the pass-through.

## Five rules for every component here

1. **Props in, markup out.** No fetching, no context beyond theme, no global state.
2. **Every string is a prop.** No literals anywhere — copy lives in
   [`content`](../../content/docs/index.md) and reaches these components through `feature`, which is
   what keeps the design system translatable and testable with props alone.
3. **Keyboard and focus, always.** `DataTable`'s clickable row has `tabIndex`, `role="button"` and an
   `Enter`/`Space` handler — together or not at all.
4. **Headless primitives for hard interaction semantics** — Base UI, below.
5. **A control is tied to its words.** `Field` puts `-hint`/`-error` ids on the paragraphs **and clones
   its child** with `aria-describedby` (joined, since it is a list) and `aria-invalid` — ids pointing at
   nothing announce nothing, which every `feature` form once inherited.

## Behaviour comes from Base UI

[Base UI](https://base-ui.com) (`@base-ui/react`) owns focus traps, inert backgrounds, focus return,
`Escape`, dismissal, roving focus and ARIA; this package owns styling and props.

| Component | Base UI part | What it took over |
| --- | --- | --- |
| `Popover` | `Popover` | Escape, outside press, focus in and back, trigger ARIA |
| `Select`, `Menu` | `Select` | the listbox: arrows, Home and End, typeahead, a hidden input for forms |
| `ThemeToggle` | `RadioGroup` | a real radio group, with arrow keys and one tab stop |
| `CommandDialog` | `Dialog` | the modal trap, the inert page, Escape, focus return |
| `Sidebar` (below `lg`) | `Dialog` | the modal trap, the inert page, Escape, focus return; at `lg` and up it stays a plain `<aside>` |
| `Dialog`, `AlertDialog` | `Dialog`, `AlertDialog` | as above; an alert dialog starts on Cancel and ignores the backdrop |
| `Tooltip` | `Tooltip` | hover and focus delays, Escape, the description link |

Hand-written: **`Field`** (nothing to take over; Base UI's would force its own control) and
**`CommandDialog`'s result list** (Enter follows the caller's router link — not a select).

**A portal leaves a nested theme**, so [`ThemeScope`](../src/theme/theme-scope.tsx) hands its scoped
element to every portal inside ([Popover](reference/popover.md)). **One scrollbar component**,
`PageScrollbar`, at the root ([Scrollbar](reference/scrollbar.md)).

**No Storybook.** `apps/web/src/route/(dev)/kitchen-sink.tsx` renders every component in every theme and
mode — no second build or story files (`Can` renders nothing to show). Component tests (`jsdom`,
`@testing-library/react`) assert *behaviour*; the route shows *appearance*.

> [!IMPORTANT]
> **`(dev)` is a route group, not a build condition** — it was once public. The loader throws
> `notFound()` unless `import.meta.env.DEV` (`apps/web/tests/route/kitchen-sink.spec.ts`). Its English
> literal labels stay: a page with no production users needs no `content` namespace.

**Tailwind for styling, Base UI for behaviour, no third-party design system.** Every component carries
a style-less `ui-*` hook (the contract specs and callers select on) first, then its utilities through
[`cn`](../src/class-name/class-name.ts), which merges so a caller's `className` wins.

## Testing

```bash
pnpm --filter @loadbearing/ui test
```

`environment: "jsdom"`, and `vitest.setup.ts` runs `afterEach(cleanup)` — **required with
`globals: false`**, else a second `render` leaves the first mounted and `getByText` finds "multiple
elements".
