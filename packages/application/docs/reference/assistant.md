---
title: Assistant
description: How a question becomes a streamed answer — the asker rebuilt in the worker, retrieval that searches as them, one log per answer, settling once, and what reaches the provider.
---

# The assistant slice

People ask a chat model about what they may read. The slice is `packages/application/src/assistant/`;
the model adapters are [infrastructure's assistant page](../../../infrastructure/docs/reference/assistant.md).

It is called the **Assistant**, never chat: the big kit's Messaging is person-to-person chat and
keeps the word, and lite keeps the same names so the two kits stay one diff apart.

## The path of one question

| Step | Where | What |
|---|---|---|
| `assistant.send` | web | permission, rate limit, the asker's active cap, the org's daily budget; one transaction writes the question and a `pending` answer; then one job |
| `realtime.assistant` | `apps/realtime` | authorship checked, then the answer's log from the resume point, then live frames until `done` |
| `GenerateAssistantAnswerUseCase` | worker, `assistant` lane | the asker rebuilt, retrieval as them, the prompt, the stream, then one settle |
| `assistant.get` | web | the thread, with every saved source checked again |

- **The job carries ids, never the question** — no message text in Redis. Published *after* commit,
  `inFlightId` = the answer's id, `attempts: 1` (a retry would bill twice); a lost publish leaves a
  `pending` answer the nightly sweep settles `failed`.
- **No activity row per question** — `ai_usage` meters cost; only `ai.assistant.thread.created`/`.deleted`
  are audited.

## The worker answers as the asker

The use-case rebuilds **the asker's** principal — `TenantMembershipReader.isActiveMember`, then uncached
`CapabilityRepository.resolveFor`, so a second-old revocation counts. A removed member or one without
`ai.assistant.use` is settled `failed` **before the model is called**.

## Retrieval searches as them, never around them

`AssistantRetrieval.find` runs the two searches a person can already run, as that person:

| Half | Through | Needs |
|---|---|---|
| Docs | `SearchDocsUseCase`, which filters spaces by audience and feature links **before** ranking | `doc.page.read` |
| Documents | `SearchDocumentsUseCase`, narrowed to the goals the asker holds | `ai.embedding.read` |

No second path to Docs vectors: `DC.2`'s hybrid rank runs inside `DocSearch`'s visible-space filter. A
half without a key is skipped; a failing provider adds nothing rather than failing the answer. **Full
text ANDs every term**, so without embeddings the query is the content words, then the two longest —
two tries at most. Hits carry a 24-word excerpt, so `DocPageRepository.listSections` reads the matched
sections in one statement, checking nothing — it only gets pages the search allowed.

## The prompt treats every passage as data

`AssistantPromptBuilder` puts a fixed system prompt first (a cacheable prefix), fences passages in
`<passage>` tags (an inner tag is broken), and fills the rest with history, newest first, whole turns.
**The provider gets** that prompt, readable passages, recent turns and the question — no ids, email or
organization name, no tools, no database.

## One log per answer

The big kit's `RV.3` replay log is per member and read whole on resume; the answer stream is neither:

- **One Redis Stream per answer**, `assistant:{<messageId>}`, never per member or per channel.
- **A resume reads only what is new** — `XRANGE key (<lastEventId> +`; a first open reads a few hundred
  entries at most.
- **Ten minutes**, on `REDIS_ASSISTANT_URL`, else realtime's, else the cache's.
- **Nothing is dropped** — the output cap bounds frames, so no drop-oldest and no `resync`.

Text coalesces to a frame per 64 characters or 100 ms; the `assistant.cancel` flag is read at most every
500 ms.

## Settling once

Exactly one of four end states; `settle` is guarded on `pending` in the statement, so duplicates and
sweeps cannot overwrite.

| Status | When | Content kept |
|---|---|---|
| `complete` | the model finished | all of it |
| `cancelled` | its author pressed stop | what had streamed |
| `interrupted` | the worker process drained | what had streamed |
| `failed` | the provider refused or failed, the asker was no longer allowed, or a defect | what had streamed |

Only if this settle won: an `ai_usage` row (no reported usage → four characters a token), the thread
touched, the budget charged; then `done`, and one `assistant.changed` to the author's channel for their
other tabs. A **defect** (not `RATE_LIMITED`/`UNAVAILABLE`) settles `failed` first, then rethrows. **A
drain interrupts; moving the lane does not** — its answers finish.

## Reopening a thread checks every source again

A saved source is ids and a title, never text. `assistant.get` asks `AssistantRetrieval.available` as
the reader stands **now** (space visible, page in their feature-filtered tree, document in a held goal);
a lost one shows a title, no link.

## The caps

| Cap | Variable | Default | Refused as |
|---|---|---|---|
| Questions a minute, per person | `RateLimitPolicy` | 20 | `RATE_LIMITED` |
| Answers generating at once, per person | `ASSISTANT_ACTIVE_PER_USER` | 2 | `RATE_LIMITED` |
| Tokens a UTC day, per organization | `ASSISTANT_ORG_DAILY_TOKENS` | 0, no cap | `RATE_LIMITED` |
| Output tokens per answer | `ASSISTANT_MAX_OUTPUT_TOKENS` | 1 024 | the model stops at `length` |

The active cap counts `pending` answers from the last ten minutes (older ones are stuck; the sweep
settles them). The budget is checked before queueing and charged at settle, so one in flight may overrun;
it lives on the never-evicting queue Redis.

## Who sees the spend

An administrator, through `ai.usage.read`: today against the daily cap, and this month, read from
`ai_usage` for that one tenant. Lite has no platform-wide report, because a sum across tenants is
never a Postgres query (`docs/ai/rules/data.md`); it comes back with the analytics store from
[`docs/scale/analytics.md`](../../../../docs/scale/analytics.md). The meter counts tokens, not money.

`ASSISTANT_PROVIDER=none`: `assistant.send` answers `NOT_FOUND`, and no `assistant` lane registers.
