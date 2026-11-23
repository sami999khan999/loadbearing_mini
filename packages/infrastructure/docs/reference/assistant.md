---
title: Assistant models
description: The chat models behind AssistantModel — OpenAI, OpenRouter, Gemini and the canned fake — how they stream, time out, fail and are chosen, for the AI assistant (AI.1).
---

# Assistant models

`AssistantModel` is the AI assistant's (`AI.1`) port: `stream(request, signal)` yields `AssistantDelta`s:

| Delta | When |
|---|---|
| `{ kind: "text", text }` | each piece of the answer, in order |
| `{ kind: "usage", inputTokens, outputTokens }` | once, at the end, when the provider reports it |
| `{ kind: "stop", reason }` | once, last: `stop` finished, `length` hit the cap, `filtered` the provider's own safety stop |

`ASSISTANT_PROVIDER` picks the adapter in `Container.buildAssistantModel` (a checked `switch`); `none`
leaves `hasAssistant` false.

| `ASSISTANT_PROVIDER` | Adapter | Default model | Needs |
|---|---|---|---|
| `none` (the default) | — | — | nothing |
| `fake` | `CannedAssistantModel` | `canned` | nothing |
| `openai` | `OpenAiAssistantModel` | `gpt-4.1-mini` | `ASSISTANT_API_KEY` |
| `openrouter` | `OpenAiAssistantModel` at `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | `ASSISTANT_API_KEY` |
| `gemini` | `GeminiAssistantModel` | `gemini-2.5-flash` | `ASSISTANT_API_KEY` |

`ASSISTANT_MODEL` overrides the model, `ASSISTANT_ENDPOINT` the base URL (a proxy or OpenAI-compatible server).

## The wire, without an SDK

Both real adapters `fetch` the streaming endpoint, read by `ServerSentEventReader` in `src/sse/` (named
for the protocol two vendors share).

- **OpenAI/OpenRouter** post `/chat/completions` with `stream: true` and `stream_options.include_usage`
  (usage on the last chunk); `max_tokens` caps. An OpenRouter `error` chunk inside a 200 is `UNAVAILABLE`.
- **Gemini** posts `models/<model>:streamGenerateContent?alt=sse`; `system` moves first to
  `systemInstruction` (a cacheable prefix), assistant turns are role `model`, the key is the
  `x-goog-api-key` header (never a logged query string), and usage is a running total, so only the last counts.

## Timeouts, cancellation and failures

`StreamWatch` gives each request one `AbortController`, aborted by whichever comes first:

- **first byte**, 30 s (a reasoning model may think first);
- **idle**, 20 s after each chunk (stalled, not slow);
- **the caller's signal** (stop pressed).

Timeouts, network failures and refusals are `UNAVAILABLE`, except **429 → `RATE_LIMITED`**; both
retryable. A cancel ends quietly with what it had. Failures log `assistant.request.failed` with
dependency, model and status — never the vendor's message, which may echo the prompt.

## The fake

`CannedAssistantModel` streams a fixed sentence word by word, with usage and a stop, calling nobody — for
keyless local work and the load test, where an optional delay shapes the stream. Never a quality signal.

## The answer stream in Redis

`RedisAssistantStreamPublisher`/`Subscriber` carry one answer from worker to its author's tab, keeping
[the application's rules](../../../application/docs/reference/assistant.md#one-log-per-answer).

| Key or channel | Holds | Lives |
|---|---|---|
| `assistant:{<messageId>}` | a Redis Stream, one entry per frame, the frame's JSON in field `f` | 10 minutes from the last write |
| `assistant:{<messageId>}` (pub/sub) | `<entry id>\|<frame JSON>` | delivered once |
| `assistant:{<messageId>}:cancel` | `1` when its author pressed stop | 10 minutes |

The braces are a hash tag: one Cluster slot for all three.

- **One script appends and announces** — `XADD`, `EXPIRE`, `PUBLISH` in one `EVAL`, the `PUBLISH`
  carrying `XADD`'s id so a reader dedupes live vs log by id (a `MULTI` cannot know the id). The channel
  is an argument, not a key, since ioredis prefixes keys, never channels.
- **The reader attaches before it reads** — subscribe, exclusive `XRANGE` after the resume point, yield
  in order, skipping live ids already read. It ends at `done`, on abort, or ten minutes after opening.
- **A failed publish throws** (realtime's logs): a lost answer frame is a hole in the text, and only the
  generation can stop and settle it.
- **Instance:** `REDIS_ASSISTANT_URL`, else realtime's (subscriber shared; channels disjoint), else the
  cache's — which evicts, so production streaming many answers sets one of the first two.
