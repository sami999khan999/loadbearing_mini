---
title: "@loadbearing/asset"
description: Every binary the product ships — images behind a closed key union, icons compiled into one sprite, and the single stylesheet that declares every @font-face. No React anywhere.
---

# `@loadbearing/asset`

**No other package imports a binary.** Images reach the UI via `ContentSource.media(key)`, icons via
`IconRegistry` by name, fonts via one CSS import in [`ui`](../../ui/docs/index.md) — so a CDN or
per-tenant asset store later is one resolver, not a hunt for every `<img src>`.

| | |
| --- | --- |
| **Package** | `@loadbearing/asset` (private, never published) |
| **Entrypoint** | `src/index.ts`, plus `./font.css` and `./sprite.svg` |
| **Depends on** | **nothing** — no workspace package, no npm runtime dependency |
| **Used by** | `content` (`ImageKey`, type-only), `ui` (`IconName` + the two file entrypoints) |
| **Environment** | pure data. No React, no DOM, no server |

```
packages/asset/
├── script/build-sprite.mjs         ← prebuild. Fails on a hardcoded fill or stroke
├── asset.d.ts                      ← what the bundler turns a binary import into
└── src/
    ├── index.ts
    ├── icon/
    │   ├── index.ts
    │   ├── icon-registry.ts        → IconRegistry, ICON_NAMES, IconName   ← generated
    │   ├── sprite.svg              ← generated, gitignored
    │   └── svg/                    check.svg · chevron-down.svg · user.svg
    ├── image/
    │   ├── index.ts
    │   ├── image.manifest.ts       → ImageManifest, ImageKey, ImageAsset
    │   └── file/brand/logo.svg
    └── font/
        └── font.css                ← the @font-face to add; no binary ships
```

## Three entrypoints, and why this package is the exception

CSS and SVG cannot live in a JavaScript barrel, so this `exports` map has three keys
([Imports and exports](../../../docs/opinions/imports.md)):

```json
".":            { "development": "./src/index.ts", "types": …, "default": … },
"./font.css":   "./src/font/font.css",
"./sprite.svg": "./src/icon/sprite.svg"
```

The extras are **non-JS files that cannot be re-exported** — the whole exemption; extra *JavaScript*
subpaths would mean two packages.

## The sprite, and why not icon components

`build-sprite.mjs` runs as `prebuild`, so a build cannot ship a registry disagreeing with the files: it
writes `sprite.svg` and `icon-registry.ts` (`ICON_NAMES`, `IconName`, `IconRegistry`).

- **Every icon inherits `currentColor`** — a theme recolours the set with no variants or JS; `ui`'s
  `<Icon>` is `<svg><use href={sprite + "#" + name} /></svg>`.
- **One request, cached forever** — icon components would be JS parsed on every load, rendered or not.
- **Adding an icon is dropping a file in `svg/`** — `IconName` gains a member and a typo is a compile
  error.

The two build-time checks and the Biome formatting the generator matches: [sprite](reference/sprite.md).

## The image manifest

```ts
const IMAGES = {
  "brand.logo": { src: brandLogo, width: 160, height: 40, alt: "Loadbearing" },
} as const satisfies Record<string, ImageAsset>;
```

- **The bundler fingerprints each import** — `src` is a content-hashed, cache-forever URL; the Tauri
  bundle serves the same files offline.
- **`ImageKey` is a closed union** — a missing image is a compile error now, a validation error from a
  CMS later.
- **Dimensions live in the manifest** — `width`/`height` on `<img>` prevents layout shift, and beside
  the file they do not drift.
- **`isKnown` uses `Object.hasOwn`, not `in`** — `"toString"` would otherwise pass and `get()` return a
  function (the permission catalog's bug; the spec pins it).

## Fonts

- **Variable fonts, one file per family** — one file for the whole weight range, usually smaller than
  three statics.
- **`font-display: swap`** — fallback text immediately; a brief flash beats a blank page (and is what
  the metric measures).
- **Self-hosted, never Google Fonts** — a third-party CDN is a privacy and GDPR exposure and an outage in
  your critical path, no faster under HTTP/2.

`font.css` is imported once, by `packages/ui/src/style/token.css`.

> [!IMPORTANT]
> **No binary ships, so no `@font-face` is declared** — `font.css` holds the block to add, commented;
> the build reports `fonts: 0 declared, 0 present`. `typography.css` stacks still name `Inter` and
> `JetBrains Mono` first, so adding a face is dropping `inter-variable.woff2` into `src/font/` and
> uncommenting one block (and the stack already uses a system-installed copy). Declaring faces for
> uncommitted files once cost a 404 per face per cold load.
>
> This check reports rather than fails, unlike the icon checks: a missing font is visibly degraded,
> whereas a hardcoded icon colour hides *in dark mode only* for weeks. It strips CSS comments first.

## What changes when assets move to a CDN

Nothing above this package: `ContentSource.media(key)` reads `ImageManifest` today, a
`CdnMediaResolver` would return a CDN URL for the same key. Records hold `"brand.logo"`, never a path —
which also makes the logo swappable per tenant, valuable for client-branded portals.

> [!NOTE]
> **User uploads are not assets** — receipts, avatars, library files are permissioned domain data via
> `StorageGateway` to S3 ([`infrastructure`](../../infrastructure/docs/index.md)). This package holds only
> what the product ships.

**Adding a raster image** (e.g. a `home/hero.webp`): `asset.d.ts` already declares `.webp` and `.png`, so
it is a file in `image/file/<subject>/` and one manifest line, the shape `brand.logo` proves.
