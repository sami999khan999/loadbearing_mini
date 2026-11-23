---
title: Explaining
description: Answering a person: what to lead with, whose words to use, and verifying before explaining.
---

# Explaining

> **The reader's new model is the deliverable, not the accuracy of the sentence.**

A plausible explanation the reader accepts and misunderstands is the silent failure here.

- **Answer the question in the first line** (`Yes.`, then the detail).
- **Plain version first, precision after:** "a slice of a big table" earns `PARTITION BY LIST`.
- **Keep their words, even wrong ones.** "Dead tables" gets an answer about dead tables, with the
  real name beside it. If they ask you to keep a word, keep it in every later answer.
- **Correct the model, not the wording:** "close, but not quite", then the one distinction that
  matters (`dead` means unreachable, not empty).
- **Problem before solution.** A mechanism described before its failure is a list of moving parts.
- **Use contrast** — a decision lands next to the case it differs from.
- **Show the real thing** (print the actual partition names) rather than describing it.
- **Anchor new ideas to ones they hold** ("the same problem that broke the tests").
- **Numbers in a small table or on their own line**, and only when they change what the reader does.
- **One idea per sentence.** A sentence beats a label and colon; a new sentence beats a semicolon.

**Verify before you explain:** read the source, run the query, count the rows. **When asked whether
something is done, re-measure rather than recall.**

**Not a rule to write less** — cutting what the reader needed is the same failure. Cut history,
restatements, and what they can already do without.

Argument: [`docs/opinions/comments.md`](../../opinions/comments.md) — the same test one level down.
