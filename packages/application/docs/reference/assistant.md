---
title: Assistant
description: How a question becomes a streamed answer — the asker rebuilt in the worker, retrieval that searches as them, one log per answer, settling once, and what reaches the provider.
---

# The assistant slice

People ask a chat model about what they may read. The slice is `packages/application/src/assistant/`;
the plan it was built from is [`docs/plans/AI-CHAT-PLAN.md`](../../../../docs/plans/AI-CHAT-PLAN.md), and
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

**The job carries ids, never the question.** The worker reads the question back from Postgres,
so no message text sits in Redis for the life of a job. It is published *after* the commit, so
the consumer never reads before the rows exist, with `inFlightId` set to the answer's id and
`attempts: 1`: a retry would ask the provider again and bill twice. A publish lost after the
commit leaves a `pending` answer, which the nightly sweep settles `failed`.

**No activity row per question.** Message volume is not an audit trail; `ai_usage` meters the
cost. Only `ai.assistant.thread.created` and `ai.assistant.thread.deleted` are recorded.

## The worker answers as the asker

The worker's own principal holds nothing a search could use. The use-case rebuilds **the asker's**
principal from the job: `TenantMembershipReader.isActiveMember`, then
`CapabilityRepository.resolveFor`, uncached, so a grant revoked a second ago is already gone.
Someone removed from the organization since they asked is no principal at all, and someone who
lost `ai.assistant.use` is refused. Either way the answer is settled `failed` **before the model is
called**.

## Retrieval searches as them, never around them

`AssistantRetrieval.find` runs the two searches a person can already run, as that person:

| Half | Through | Needs |
|---|---|---|
| Docs | `SearchDocsUseCase`, which filters spaces by audience and feature links **before** ranking | `doc.page.read` |
| Documents | `SearchDocumentsUseCase`, narrowed to the goals the asker holds | `ai.embedding.read` |

There is no second path to Docs vectors: `DC.2`'s hybrid rank runs inside `DocSearch`, inside the
visible-space filter, so space visibility is enforced in one place. A half the asker holds no key
for is skipped, and a half whose provider fails adds nothing rather than failing the answer.

**Full text ANDs every term**, so a whole question would match almost nothing. Without an embedding
provider the query is the question's content words, then its two longest words when those found
nothing: two lexical tries at most. With one, meaning is ranked from the question as written.

The search hit carries a 24-word excerpt, too little to answer from. `DocPageRepository.listSections`
then reads the matched sections in full, one statement for every page. It checks nothing itself:
it is only ever handed pages the search already let through.

## The prompt treats every passage as data

`AssistantPromptBuilder` puts a fixed system prompt first, identical on every request so a provider
can cache the prefix. Passages are fenced in `<passage>` tags, and a tag inside one is broken so it
cannot close its fence early. History fills what is left, newest first, a turn whole or not at all.

**What the provider receives**: that system prompt, the passages the asker may read, the thread's
recent turns, and the question. It receives no ids, no email, no organization name, and it has no
tools and no database access.

## One log per answer

The big kit's `RV.3` is a realtime replay log written per member and read whole on every resume.
The answer stream inherits neither, here or there:

- **One Redis Stream per answer**, `assistant:{<messageId>}`, never per member or per channel.
- **A resume reads only what is new**: `XRANGE key (<lastEventId> +`, exclusive. A first open reads
  the answer's log from the start, which is a few hundred entries at most.
- **Ten minutes**, on `REDIS_ASSISTANT_URL`, then the realtime instance, then the cache's.
- **Nothing is dropped.** An answer's frames are bounded by its output cap, so there is no
  drop-oldest queue and no `resync`.

Text is coalesced: a frame every 64 characters or 100 ms, whichever is first, never one per token.
The stop flag (`assistant.cancel`) is a Redis key the worker reads at most every 500 ms.

## Settling once

Every answer ends in exactly one of four states, and `settle` is guarded on `pending` in the
statement itself, so a duplicate job or a racing sweep cannot overwrite it.

| Status | When | Content kept |
|---|---|---|
| `complete` | the model finished | all of it |
| `cancelled` | its author pressed stop | what had streamed |
| `interrupted` | the worker process drained | what had streamed |
| `failed` | the provider refused or failed, the asker was no longer allowed, or a defect | what had streamed |

Then, only if this settle won: an `ai_usage` row, the thread touched, the day's budget charged.
Then a `done` frame to end the stream, and one `assistant.changed` invalidation to the author's own
channel, so their other tabs refresh the thread list. A provider that reports no usage is
estimated at four characters a token.

A **defect** — any throw that is not `RATE_LIMITED` or `UNAVAILABLE` — is settled `failed` first and
rethrown after, so the asker is not left watching a spinner while the job records why.

**A drain interrupts; a moved lane does not.** The worker aborts in-flight answers only when the
process stops. When the dashboard moves the `assistant` lane off a process, its answers finish.

## Reopening a thread checks every source again

A saved source is ids and a title, never the passage text. `assistant.get` asks
`AssistantRetrieval.available` about each one as the reader stands **now**: the space still
visible to them, the page still in their feature-filtered tree, the document still indexed in a
goal they hold. One they lost shows as unavailable — a title, no link.

## The caps

| Cap | Variable | Default | Refused as |
|---|---|---|---|
| Questions a minute, per person | `RateLimitPolicy` | 20 | `RATE_LIMITED` |
| Answers generating at once, per person | `ASSISTANT_ACTIVE_PER_USER` | 2 | `RATE_LIMITED` |
| Tokens a UTC day, per organization | `ASSISTANT_ORG_DAILY_TOKENS` | 0, no cap | `RATE_LIMITED` |
| Output tokens per answer | `ASSISTANT_MAX_OUTPUT_TOKENS` | 1 024 | the model stops at `length` |

The active cap counts `pending` answers from the last ten minutes only. An older one is stuck,
not running, so it stops counting and the nightly sweep settles it.

The budget is checked before a question is queued and charged when its answer settles, so one in
flight may finish over the line. It lives on the queue Redis, which never evicts: an evicted count
would be a day's budget again.

## Who sees the spend

An administrator, through `ai.usage.read`: today against the daily cap, and this month, read from
`ai_usage` for that one tenant. Lite has no platform-wide report, because a sum across tenants is
never a Postgres query (`docs/ai/rules/data.md`); it comes back with the analytics store from
[`docs/scale/analytics.md`](../../../../docs/scale/analytics.md). The meter counts tokens, not money.

`ASSISTANT_PROVIDER=none` builds no model. `assistant.send` then answers `NOT_FOUND`, and the
worker registers no `assistant` lane.
