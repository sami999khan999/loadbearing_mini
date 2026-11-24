---
title: Repository rules
description: The rules an agent must know unprompted, one file per topic. A digest of docs/opinions/ — that directory holds the argument, these files hold the rule.
---

# Repository rules

One file per topic. **`AGENTS.md` `@`-imports all of them**, so every agent that starts there holds
the whole rulebook — Claude Code inlines the imports, the rest read the files. The task router
in [`docs/ai/index.md`](../index.md) maps a task to the file that answers it. Multi-file procedures
are run books in [`../skills/`](../skills/index.md).

| File | Decides |
|---|---|
| [`layering.md`](layering.md) | The one-way dependency graph, the server-only boundary, where an adapter may be named |
| [`files.md`](files.md) | Kebab-case, the closed role-suffix set, one class per file, where tests go |
| [`folders.md`](folders.md) | What `src/` may hold, role vs subject folders, the two exceptions |
| [`imports.md`](imports.md) | One entrypoint, no `export *`, the three import rules, `import.ts` |
| [`classes.md`](classes.md) | Seam nouns, technology prefixes, the method vocabulary, `assert` vs `can` |
| [`comments.md`](comments.md) | `//` only, two lines, where the reasoning goes instead |
| [`color.md`](color.md) | The twelve custom properties, the one file that may write a literal, deriving a state |
| [`dependencies.md`](dependencies.md) | The catalog, the four tiers, what a new dependency needs |
| [`vocabulary.md`](vocabulary.md) | Permission vs procedure vs activity vs log code, and the naming that bites |
| [`data.md`](data.md) | Which store owns which data, and what every new schema must carry |
| [`visibility.md`](visibility.md) | Flag, entitlement, permission — which hides what, and in what order |
| [`simplicity.md`](simplicity.md) | The tie-breaker when two designs satisfy every other rule |
| [`workflow.md`](workflow.md) | Commands, what to run before claiming done, commits and who authors them, adding a feature |
| [`explaining.md`](explaining.md) | Answering a person: what to lead with, whose words to use, verifying first |

**A rule is stated here when not knowing it causes a silent violation** — code that compiles, lints
and passes review while wrong. Each file ends by citing its page in
[`docs/opinions/`](../../opinions/index.md), which holds the argument and the worked example.
**When a file here and its cited page disagree, the page wins and this file is stale; say so.**
Never re-derive a convention from surrounding code. `packages/<name>/docs/` explains why an export
is shaped as it is.

**The two tests every rule serves:** given a feature name and a layer, you can write the file path,
folder and class name without looking anything up; given a fact the system produces, you can say
which store owns it.

**Checked** by `check-architecture.mjs` §12: every opinions page is cited by a rule file, every rule
file is routed to from `AGENTS.md`, [`docs/ai/index.md`](../index.md) or here, `AGENTS.md`
`@`-imports every rule file, and every route and import exists. A new rule file is one change:
the file, its row here and in the router, and its `@` line in `AGENTS.md`.
