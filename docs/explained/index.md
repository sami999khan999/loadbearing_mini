---
title: The plain-language guide
description: The whole project explained without assuming you know it — how everything works, and what every package and file is for.
---

# The plain-language guide

These pages explain loadbearing lite (the small kit) for
someone new to it. They use plain words, and name a file only where it helps you find something.

| Page | Read it when |
|---|---|
| [How everything works](architecture.md) | You want the whole picture: the programs that run, how the code is layered, and what happens, step by step, when someone signs in, clicks a button, reads a doc or waits for an email. Start here. |
| [The codebase, file by file](codebase/index.md) | You want to know what a package is for, or what one particular file does. One page per package, every file listed. |

## How this fits with the other docs

The rest of `docs/` is written for people already working on the code:

- [`ai/`](../ai/index.md) states the rules flatly; [`opinions/`](../opinions/index.md) argues for them.
- [`infra/`](../infra/index.md) is the running Docker stack and deployment.
- Each package's own `docs/` folder explains why its exports are shaped the way they are.
- [`scale/`](../scale/index.md) explains how to bring back each piece the small kit removed.

When one of those pages and this guide disagree, the other page is the more precise one; this guide
trades precision for plainness.

The [codebase pages](codebase/index.md) are generated from the repository's own file list, so every
file in the repository appears on exactly one of them.

## Reading it inside the app

Both seeds put these pages into the app's own docs system, together with every other docs tree in
the repository, one space per area, all in the platform organization. This guide becomes the
`explained` space, which the platform's own staff read at `/doc/explained`.

```bash
pnpm seed:dev    # locally: the platform organization, the docs, and an admin to sign in as
pnpm seed:prod   # on a deploy: the same, without the admin
```

Run either again after editing the docs. A re-run changes only the pages that changed and removes
pages the trees no longer have, so an edit made in the app to one of these spaces is overwritten:
the repository is where these pages are written.
