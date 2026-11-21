---
title: Backlog
description: The only open ledger for the lite kit — every item not done, in one place.
schema: backlog/v1
---

# Backlog

**The only open ledger.** Close an entry by fixing it and deleting it; git history keeps the rest.
Checkboxes: `[ ]` todo, `[~]` in progress, `[!]` blocked.

**None of these can be closed by writing code.** Each waits on something the owner holds: provider
keys, a quiet machine, a public URL, or a declared flag.

To check an entry, run [the standard pass](HANDOFF.md#the-standard-pass) whole, then the entry's own
check. Users alice, bob and carol (`Correct-Horse-9`), web on port 23000, mail in Mailpit on 28025,
with the worker running.

## Real AI providers — waits on OpenAI, OpenRouter and Gemini keys

- [~] `LT4` **AI search with `openai` and `gemini`.** The three search specs pass, and `none`
  makes no outbound call (2026-10-10). Still owed: set `AI_PROVIDER` to `openai`, then `gemini`,
  run `pnpm ai:reindex --docs`, and check a docs search and a `/search` query return ranked hits
  in each mode.
- [ ] `AI.3` **The Assistant against a real provider**, once each for `openai`, `openrouter` and
  `gemini`: send, the stream moving, Stop, and the usage meter counting the answer. The same walk
  passed with `ASSISTANT_PROVIDER=fake` on 2026-11-12.

## Docs latency budgets — waits on a quiet machine

- [~] `DS0.2` **Budgets, on one web process.** The query budget is met: a warm read makes 0
  queries. The latency budgets need `pnpm doc:bench` on a quiet machine; the 2026-11-12 attempt
  shared the host with another project using about seven cores.

  | Path | Budget |
  |---|---|
  | Page read, warm / cold | 0 / 2 queries; p95 ≤ 150 ms at 100 req/s |
  | Nav for a 2,000-page space | ≤ 60 KB gzipped, fetched once per space version |
  | Search | p95 ≤ 120 ms, bounded by `limit` |
  | Publish of a 200,000-character page | ≤ 1 s, or rendered in the worker |
  | Access filtering (`DS1.4`) | 0 extra queries, linear in nav nodes |
  | Largest page in the browser | no long task over 200 ms on first paint |

## Docs Open-in-AI links — waits on a public URL

- [ ] `DS5` **Follow each Open link.** The menu offers Markdown, ChatGPT and Claude on a public
  page and only Edit on a linked one (checked 2026-10-02). Still owed: from a deployment on a
  public URL, follow ChatGPT and Claude and confirm each tool fetches the page's Markdown.

## Feature flags, by hand — waits on a declared flag

Lite declares no feature flag, so neither check has anything to act on.

- [~] `DS1` **A doc page linked to a flag.** The permission, module and plan links all hide and
  show as documented (2026-11-12). Still owed: a page with `flag: <key>` is 404 and absent from the
  sidebar while the flag is off, and reads once it is on.
- [~] `MC.3` **Toggle a flag in platform admin.** A plan narrowed an organization's menu at once
  (2026-10-10); the entitlement half is done. Still owed: turn a flag on for one organization and
  see its surface appear there only.
