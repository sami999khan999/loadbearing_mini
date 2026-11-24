---
title: Skills
description: Run books — the executable checklist form of a procedure that touches many packages in a fixed order.
---

# Skills

A skill is a **run book**: the checklist form of a procedure that touches many places in an order
that matters. Not a rule (that is [`../rules/`](../rules/index.md)) and not an explanation (that is
[`docs/opinions/`](../../opinions/index.md)) — the steps, in sequence, with what to verify.

| Run book | Covers |
|---|---|
| [`add-slice.md`](add-slice.md) | Adding a feature slice — the twelve steps through permissions, contracts, infrastructure, application, query, content, feature, and the web app |
| [`add-docs.md`](add-docs.md) | Writing a package's `docs/` — what `index.md` must answer, when a reference page earns its place, the `meta.json` that orders them |

## How these are reached

Each run book is one file here. Every other path to it is an `@` pointer, never a copy:

- **Claude Code** — `.claude/skills/<name>/SKILL.md`. The model loads it on its own when a task
  matches the `description`, the `@` line inlines this run book, and `/<name>` runs it by hand.
- **Codex and other Agent Skills readers** — `.agents/skills/<name>/SKILL.md`, the same file. They
  do not inline `@`, so they read the path and open it.
- **Any agent** — `AGENTS.md` and the task router in [`../index.md`](../index.md) name the file.
- **A person** — this page.

**The description is the trigger.** It is the only text an agent sees before deciding to load a
skill, so it says what the run book does *and* the words a request arrives in ("a new entity", "a
CRUD page"). It is written in two places, the run book (for the docs site) and each `SKILL.md`
(for the agent), and §33 fails when they differ.

## Adding one

A procedure earns a run book when it touches more than one package in an order that is not
obvious, and getting the order wrong costs a rewrite rather than a review comment. Anything
smaller is a rule.

1. Write `<name>.md` here with `title` and `description` frontmatter, and add it to `meta.json`.
2. Write the same `SKILL.md` in both `.claude/skills/<name>/` and `.agents/skills/<name>/`:

   ```markdown
   ---
   name: <name>
   description: <the run book's description, word for word>
   ---

   @docs/ai/skills/<name>.md
   ```

3. Add a row to the table above, to `AGENTS.md`'s skills table, and to the router in
   [`../index.md`](../index.md).

`check-architecture.mjs` §33 fails on a missing `SKILL.md`, a `name` that is not its folder, a
description that drifted, a body that says more than the `@` line, or a skill folder with no run
book.
