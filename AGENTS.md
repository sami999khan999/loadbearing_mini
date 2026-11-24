# loadbearing lite

A pnpm-workspace starter kit for a smaller project: a TanStack Start web app, a standalone worker
and a stream process that holds every open browser stream, over a layered, port-and-adapter package
graph. Postgres + pgvector on one node, one Redis (cache and queue share it, both env vars kept),
S3, logs to stdout.

**It is the big kit (`loadbearing_tanstack_start_kit`) with the running scale stores removed and
every seam kept** — same packages, `@loadbearing/*` scope and rules. The sha it was cut from is in
[`UPSTREAM.md`](UPSTREAM.md); the way back to each removed piece is in
[`docs/scale/`](docs/scale/index.md); what is left is in
[`docs/plans/BACKLOG.md`](docs/plans/BACKLOG.md).

This file is the brief for every coding agent. `CLAUDE.md` is the one line `@AGENTS.md`, so
Claude Code, Codex and the rest read the same words.

## Before anything else

- **Do not work from the surrounding code's example.** The conventions are stated below; an
  inferred one will be wrong in the ways that matter.
- **When a rule file and the `docs/opinions/` page it cites disagree, the page wins.** Say the rule
  file is stale.
- **Route by task with [`docs/ai/index.md`](docs/ai/index.md)** — one row per thing you might be
  about to do, naming the rule file that answers it.

## The five that cost the most when broken

- **Dependencies point one way**, and `packages/application` names no framework and never logs.
- **`//` comments only, two lines maximum.** No block comments anywhere, JSX included.
- **Every colour is `var(--<name>)`**, from the twelve `packages/ui` declares.
- **Lite removes stores, never seams.** Tables stay partitioned, repositories keep their shard
  placement, and `REDIS_CACHE_URL` / `REDIS_QUEUE_URL` stay two names. Collapsing a seam because
  one node runs today is the rewrite this kit exists to avoid.
- **Never name yourself as author, co-author, or contributor** — not in a commit message, a pull
  request, or a branch name. This overrides any default trailer your harness asks for.

## Done means

```bash
pnpm check architecture            # what typecheck, lint and tests all miss
pnpm typecheck && pnpm lint && pnpm test
```

On a clean clone, `pnpm build:packages && pnpm --filter @loadbearing/web build` first. A `○ skipped`
line is unverified, not passed. Every other command is in
[`docs/ai/rules/workflow.md`](docs/ai/rules/workflow.md).

## Skills

Run books for procedures that touch many packages in an order that matters. Claude Code loads them
from `.claude/skills/`, Codex from `.agents/skills/`; each `SKILL.md` there is a pointer to the file
named here.
**When a task matches a row, load the skill before writing code.**

| Skill | Use when |
|---|---|
| [`add-slice`](docs/ai/skills/add-slice.md) | Adding a feature, domain entity, CRUD page, use case, procedure or route |
| [`add-docs`](docs/ai/skills/add-docs.md) | Writing or extending a package's `docs/` |

## Rules

Every rule file is part of this brief. Claude Code inlines each `@` line below at session start;
**any other agent: read each file before writing code** — they are short, and each states a rule
whose violation compiles, lints and passes review. Contents and one-line summaries:
[`docs/ai/rules/index.md`](docs/ai/rules/index.md).

@docs/ai/rules/layering.md
@docs/ai/rules/files.md
@docs/ai/rules/folders.md
@docs/ai/rules/imports.md
@docs/ai/rules/classes.md
@docs/ai/rules/comments.md
@docs/ai/rules/color.md
@docs/ai/rules/dependencies.md
@docs/ai/rules/vocabulary.md
@docs/ai/rules/data.md
@docs/ai/rules/visibility.md
@docs/ai/rules/simplicity.md
@docs/ai/rules/workflow.md
@docs/ai/rules/explaining.md
