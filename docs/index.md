---
title: Documentation
description: The documentation trees and what each is for — the rules an agent loads, the argument behind them, and the running stack.
---

# Documentation

Split by **what you need**, not by who is reading.

| Tree | Is | Read it |
|---|---|---|
| [`ai/`](ai/index.md) | The rules, stated flatly, routed by task | Continually, one or two files at a time |
| [`opinions/`](opinions/index.md) | The argument behind each rule — the failure it prevents, the worked example | When a rule needs settling or challenging |
| [`infra/`](infra/index.md) | The running stack and the log pipeline | When something is wrong with it |
| [`explained/`](explained/index.md) | A plain-language guide for someone new: [how it works](explained/architecture.md) and [every package and file](explained/codebase/index.md) | Once, to get oriented. Where it and a tree disagree, the tree is precise |
| [`scale/`](scale/index.md) | The way back to each store lite removed, one page per store | When a trigger fires |
| [`plans/`](plans/index.md) | What is left to do, in one backlog | When picking up work |

`packages/<name>/docs/` explains why each package's exports are shaped as they are, next to the
code. [`infra/docs/`](../infra/docs/index.md) is the same for the compose directory.

**`ai/` holds the rule, `opinions/` the reason.** A rule file (~600 tokens) says what to do; its
opinions page says why, with the failure behind it. Start from `ai/` and follow a rule file's last
line to its argument. **When the two disagree, `opinions/` wins** and the rule file is stale — say so.
