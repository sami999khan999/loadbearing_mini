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

These pages can also be published into the app's own docs system, together with every other docs
tree in the repository, one space per area. This guide becomes the `explained` space:

```bash
pnpm docs:publish <base-url> <credentials-file> <organization-id> [--audience members]
pnpm docs:publish <base-url> <credentials-file> <organization-id> --space explained
```

The credentials file holds two lines, `email=` and `password=`, for someone allowed to manage doc
spaces in that organization. The default audience, `members`, makes the spaces readable by that
organization's members, this one at `/doc/explained`. In the platform organization,
`--audience public` puts them at `/docs/...` for anyone. Running it again only changes the pages
that changed, `--prune` removes pages the trees no longer have, and `--dry-run` prints what would be
published without sending anything.
