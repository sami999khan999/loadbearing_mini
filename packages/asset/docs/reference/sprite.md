---
title: Sprite build
description: The two checks that fail the build, why the generated registry has to match Biome's formatter exactly, and why the sprite is gitignored while the registry is committed.
---

# `build-sprite.mjs`

Runs as `prebuild`, so a build cannot ship a registry disagreeing with `src/icon/svg/*.svg`. It writes
two files:

| Output | Committed? | Why |
| --- | --- | --- |
| `src/icon/sprite.svg` | **no**, gitignored | Every icon addition would be a merge conflict in a file nobody reads |
| `src/icon/icon-registry.ts` | **yes** | `tsc --noEmit` and every consumer's typecheck need `IconName` without running a build first |

The sprite is pure output; the type system depends on the registry. Ignoring both breaks a fresh
clone's typecheck; committing both doubles the conflicts.

## The two checks that fail the build

Both verified by introducing the violation and watching the build fail — re-test before "tidying".

**1. A hardcoded `fill` or `stroke`.**

```js
if (/(fill|stroke)=["'](?!none|currentColor)[^"']+["']/.test(raw)) { … }
```

One stray `fill="#333"` makes an icon invisible *only* on dark backgrounds — unnoticed until a customer
screenshot; the build is the one moment not needing someone on the right theme. `none` (an outline's
unpainted interior) and `currentColor` (inherit text colour) are the legitimate values.

**2. A missing `viewBox`.**

A `<symbol>` without one sizes to whatever each `<use>` implies — silently per call site, looking like a
CSS bug.

Both checks report **all** problems before exiting (one-per-build fixing gets checks disabled), and
**write nothing on failure** — the previous good sprite and registry stay.

## The generated registry must match Biome's formatter exactly

```js
const inline = `export const ICON_NAMES = [${names.map((n) => `"${n}"`).join(", ")}] as const;`;
const declaration = inline.length <= 100 ? inline : /* one entry per line */;
```

Biome inlines an array that fits `lineWidth` (100) and expands it otherwise; always expanding would make
**every icon addition appear twice** (generated, then reformatted) in a "do not edit" file. Both branches
are verified clean (three icons inline, twenty-seven expanded). **A generator writing into a linted tree
owns the formatting.**

## Names are sorted

`readdirSync(...).sort()`, asserted by a spec — directory order differs across platforms, which would
make Linux and Windows builds disagree; sorted, an addition is a one-line diff. Why a sprite at all is in
the [package index](../index.md#the-sprite-and-why-not-icon-components); its cost is that `<use>` needs
the sprite URL, hence the `./sprite.svg` entrypoint.

## What the specs pin

`tests/icon/icon-registry.spec.ts` asserts `ICON_NAMES` equals `src/icon/svg/` at runtime — catching an
icon committed without a build, the one failure this design allows. Sprite assertions check one
`<symbol>` per name, a `viewBox` each, and no hardcoded colour in the *output* too.
