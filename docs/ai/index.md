---
title: AI
description: Everything written for coding agents rather than for people. The task router — one row per thing you might be about to do — plus the rules and the skill run books it points at.
---

# AI

Material written for a coding agent to load, as opposed to `docs/opinions/` (the argument, written
to be read and reviewed).

`loadbearing lite` is a pnpm-workspace starter kit: TanStack Start web app + standalone worker +
stream process over a layered, port-and-adapter package graph. Postgres + pgvector on one node, one
Redis serving both the cache and the queue names, S3, logs to stdout. It is the big kit with the
running scale stores removed and every seam kept — see [`docs/scale/`](../scale/index.md).

## Open the row that matches what you are about to do

**If you started from `AGENTS.md` you already hold every rule file** — it lists all of them, and
Claude Code inlines them (`CLAUDE.md` is `@AGENTS.md`). This table is then a map of
what is in your context. An agent that did not load them reads the row a task needs.

| About to | Read |
|---|---|
| Place a new file or folder | [`rules/files.md`](rules/files.md) + [`rules/folders.md`](rules/folders.md) |
| Write an import or a barrel | [`rules/imports.md`](rules/imports.md) |
| Name a class, port, or method | [`rules/classes.md`](rules/classes.md) |
| Name a permission, event, table, or env var | [`rules/vocabulary.md`](rules/vocabulary.md) |
| Add a table, migration, or store | [`rules/data.md`](rules/data.md) |
| Gate something behind a flag, a plan or a permission | [`rules/visibility.md`](rules/visibility.md) |
| Add a dependency | [`rules/dependencies.md`](rules/dependencies.md) |
| Decide which package something belongs in | [`rules/layering.md`](rules/layering.md) |
| Write a comment | [`rules/comments.md`](rules/comments.md) |
| Style anything — a colour, a component, a stylesheet | [`rules/color.md`](rules/color.md) |
| Decide how much structure to build | [`rules/simplicity.md`](rules/simplicity.md) |
| Run, verify, or commit a change | [`rules/workflow.md`](rules/workflow.md) |
| Explain something to the person you are working with | [`rules/explaining.md`](rules/explaining.md) |
| Write a commit message, a PR body, or a branch name | [`rules/workflow.md`](rules/workflow.md) — and never name yourself as author, co-author, or contributor |
| Add a feature slice | [`skills/add-slice.md`](skills/add-slice.md) |
| Write or extend a package's `docs/` | [`skills/add-docs.md`](skills/add-docs.md) |
| Get the whole rulebook, not one topic | [`rules/index.md`](rules/index.md) |
| Understand *why* a rule exists | [`docs/opinions/`](../opinions/index.md) |
| Understand the running stack | [`docs/infra/`](../infra/index.md) |
| Bring back something the lite kit removed | [`docs/scale/`](../scale/index.md) — never rebuild it from memory |
| Pick up or tick off planned work | [`docs/plans/`](../plans/index.md) |

Do not work from the surrounding code's example. This repository's conventions are stated, and a
convention you infer will be wrong in the ways that matter.

## What is here

- **[`rules/`](rules/index.md)** — the rules, one file per topic. A rule is stated there when not
  knowing it causes a *silent* violation: code that compiles, lints, and passes review while being
  wrong. Everything you would naturally look up is a reference instead.
- **[`skills/`](skills/index.md)** — run books, the executable checklist form of a procedure.
  Agents load one when a task matches its `description`; `/add-slice` and `/add-docs` run one by
  hand in Claude Code.

## How an agent reaches this

```
AGENTS.md                         ← the one brief; every agent loads it unprompted
  ├── @docs/ai/rules/*.md         ← every rule file, inlined by Claude Code, read by the rest
  └── docs/ai/index.md            ← this file: routes by task
CLAUDE.md                         ← `@AGENTS.md` and nothing else: Claude Code reads the same brief

docs/ai/skills/<name>.md          ← the run book, loaded when a task matches its description
  ├── .claude/skills/<name>/SKILL.md ← name + description, then `@` the run book: Claude Code
  └── .agents/skills/<name>/SKILL.md ← the same file: Codex and other Agent Skills readers
```

**The rulebook loads whole; run books load on demand.** Every file in `rules/` is there because
**not knowing it causes a silent violation**, and that is the class of rule an agent cannot know
to go and look for — nothing in the task signals the gap. A rule that loads only when someone
thinks to load it holds by luck, and the whole rulebook costs less than one large source file.
A run book is a procedure executed on request; its `description` is enough to know when.

**One copy of every document, and the rest are `@` pointers.** A second copy in a tool's own
format drifts, and each agent obeys its own copy while both look followed. Claude Code inlines an
`@` line, so it gets the whole file at once; an agent that does not reads the path and opens it.
The only text written twice is a skill's `description`, because an agent reads it before loading
anything.

## What keeps it honest

`check-architecture.mjs` holds the shape in place:

- **§12** — every `docs/opinions/` page is cited by a rule file, every rule file is routed to and
  `@`-imported by `AGENTS.md`, and every route and import names a file that exists. A new opinions
  page cannot land while the digest omits it, and a rule file cannot be orphaned or left out of the
  session load.
- **§33** — `CLAUDE.md` is exactly `@AGENTS.md`, and every run book has a `SKILL.md` in both
  `.claude/skills/` and `.agents/skills/` whose `name` matches its folder, whose `description`
  matches the run book's, and whose body is the one `@` line.

Neither checks that a rule file's summary of its page is still *accurate*. That is why every file
in `rules/` ends by citing the page that wins any disagreement.
