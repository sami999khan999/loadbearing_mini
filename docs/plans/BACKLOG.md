---
title: Backlog
description: The only open ledger for the lite kit — every item not done, in one place. Closed entries are in archive/DONE.md.
schema: backlog/v1
---

# Backlog

**This is the only open ledger, and it holds only what is open.** Every closed entry is in
[`archive/DONE.md`](archive/DONE.md), under the section number it had here. Every finished plan is
in [`archive/`](archive/index.md), and the only other live file is [`HANDOFF.md`](HANDOFF.md).

Checkboxes: `[ ]` todo, `[~]` in progress, `[!]` blocked. **Close an entry by moving it** to
`archive/DONE.md` with the date and its proof.

**None of these can be closed by writing code.** Each waits on something the owner holds: provider
keys, a quiet machine, a public URL, or a declared flag.

| Section | What | Open | Waits on |
|---|---|---|---|
| 10 | Runs against real AI providers | 2 | OpenAI, OpenRouter and Gemini keys |
| 11 | The docs latency budgets | 1 | a quiet machine |
| 12 | The docs Open-in-AI links | 1 | a public URL |
| 13 | Feature flags, by hand | 2 | a declared flag |

Sections 1 to 9 are closed in full and are in `archive/DONE.md`.

## How to check a closed entry

Run the standard pass in [`archive/TESTS.md`](archive/TESTS.md#the-standard-pass), whole, then the
entry's own check. Users alice, bob and carol (`Correct-Horse-9`), web on port 23000, mail in
Mailpit on 28025, with the worker running.

---

## 10. Runs against real AI providers

- [~] `LT4` **AI search with `openai` and `gemini`.** The three search specs pass, and `none`
  makes no outbound call (2026-10-10). Still owed: set `AI_PROVIDER` to `openai`, then `gemini`,
  run `pnpm ai:reindex --docs`, and check a docs search and a `/search` query return ranked hits
  in each mode. — `archive/TESTS.md`, `archive/LITE-KIT-PLAN.md` `LT4`
- [ ] `AI.3` **The Assistant against a real provider**, once each for `openai`, `openrouter` and
  `gemini`: send, the stream moving, Stop, and the usage meter counting the answer. The same walk
  passed with `ASSISTANT_PROVIDER=fake` on 2026-11-12. — `archive/TESTS.md`, manual checks

## 11. The docs latency budgets

- [~] `DS0.2` **Budgets, on one web process.** The query budget is met: a warm read makes 0
  queries. The latency budgets need `pnpm doc:bench` on a quiet machine; the 2026-11-12 attempt
  shared the host with another project using about seven cores. — `archive/DOCS-SYSTEM-PLAN.md` `DS0.2`

  | Path | Budget |
  |---|---|
  | Page read, warm / cold | 0 / 2 queries; p95 ≤ 150 ms at 100 req/s |
  | Nav for a 2,000-page space | ≤ 60 KB gzipped, fetched once per space version |
  | Search | p95 ≤ 120 ms, bounded by `limit` |
  | Publish of a 200,000-character page | ≤ 1 s, or rendered in the worker |
  | Access filtering (`DS1.4`) | 0 extra queries, linear in nav nodes |
  | Largest page in the browser | no long task over 200 ms on first paint |

## 12. The docs Open-in-AI links

- [ ] `DS5` **Follow each Open link.** The menu offers Markdown, ChatGPT and Claude on a public
  page and only Edit on a linked one (checked 2026-10-02). Still owed: from a deployment on a
  public URL, follow ChatGPT and Claude and confirm each tool fetches the page's Markdown.
  — `archive/TESTS.md`, `archive/DOCS-SYSTEM-PLAN.md` `DS5`

## 13. Feature flags, by hand

Lite declares no feature flag, so neither check has anything to act on. Both close the first time a
flag is declared.

- [~] `DS1` **A doc page linked to a flag.** The permission, module and plan links all hide and
  show as documented (2026-11-12). Still owed: a page with `flag: <key>` is 404 and absent from the
  sidebar while the flag is off, and reads once it is on. — `archive/TESTS.md`
- [~] `MC.3` **Toggle a flag in platform admin.** A plan narrowed an organization's menu at once
  (2026-10-10); the entitlement half is done. Still owed: turn a flag on for one organization and
  see its surface appear there only. — `archive/TESTS.md`, manual checks
