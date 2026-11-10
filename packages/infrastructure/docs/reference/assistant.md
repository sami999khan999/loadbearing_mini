---
title: assistant
description: The chat models behind AssistantModel — OpenAI, OpenRouter, Gemini and the canned fake — how they stream, time out, fail and are chosen, for the AI assistant (AI.1).
---

# Assistant models

`AssistantModel` is the port the AI assistant (`AI.1`, [`plans/AI-CHAT-PLAN.md`](../../../../plans/AI-CHAT-PLAN.md))
generates through. One method, `stream(request, signal)`, yields the answer as `AssistantDelta`s:

| Delta | When |
|---|---|
| `{ kind: "text", text }` | each piece of the answer, in order |
| `{ kind: "usage", inputTokens, outputTokens }` | once, at the end, when the provider reports it |
| `{ kind: "stop", reason }` | once, last: `stop` finished, `length` hit the cap, `filtered` the provider's own safety stop |

`ASSISTANT_PROVIDER` picks the adapter once, in `Container.buildAssistantModel`, a `switch` the
compiler checks. `none` builds nothing and `hasAssistant` is false: the feature is off.

| `ASSISTANT_PROVIDER` | Adapter | Default model | Needs |
|---|---|---|---|
| `none` (the default) | — | — | nothing |
| `fake` | `CannedAssistantModel` | `canned` | nothing |
| `openai` | `OpenAiAssistantModel` | `gpt-4.1-mini` | `ASSISTANT_API_KEY` |
| `openrouter` | `OpenAiAssistantModel` at `https://openrouter.ai/api/v1` | `openai/gpt-4.1-mini` | `ASSISTANT_API_KEY` |
| `gemini` | `GeminiAssistantModel` | `gemini-2.5-flash` | `ASSISTANT_API_KEY` |

`ASSISTANT_MODEL` overrides the model, and `ASSISTANT_ENDPOINT` the base URL, for a proxy or an
OpenAI-compatible server.

## The wire, without an SDK

Both real adapters are `fetch` against the vendor's streaming endpoint, read by
`ServerSentEventReader` in `src/sse/`. That folder is named for the protocol, not a vendor, because
two vendors share it.

- **OpenAI and OpenRouter** post `/chat/completions` with `stream: true` and
  `stream_options.include_usage`, so the last chunk carries the token counts. `max_tokens` is the cap,
  the name both read. OpenRouter can report a provider failure *inside* a 200 stream, as an `error`
  chunk; the adapter reads it as `UNAVAILABLE`.
- **Gemini** posts `models/<model>:streamGenerateContent?alt=sse`. A `system` message moves to
  `systemInstruction`, first, so the fixed prompt stays a cacheable prefix. An assistant turn is
  role `model`. The key is the `x-goog-api-key` header, never the query string a proxy log keeps.
  Usage is a running total on every chunk, so only the last is reported.

## Timeouts, cancellation and failures

`StreamWatch` gives each request one `AbortController`, aborted by whichever comes first:

- **the first-byte window**, 30 s, before anything arrives: a reasoning model may think first;
- **the idle window**, 20 s, after each chunk: a stream that stops sending is stalled, not slow;
- **the caller's signal**: the reader pressed stop.

A timeout is `UNAVAILABLE`, and so is a network failure or any refusal but one: a **429 is
`RATE_LIMITED`**. Both are retryable in the error catalog. A cancel is not a failure: the stream
ends quietly with what it had. Every failure logs `assistant.request.failed` with the dependency,
the model and the status, and never the vendor's message, which may echo the prompt.

## The fake

`CannedAssistantModel` answers the last question with a fixed sentence, word by word, with usage
and a stop, and calls nobody. It is for local work without a key and for the load test, where an
optional delay between words gives a stream its shape. It is never a quality signal.

## The answer stream in Redis

`RedisAssistantStreamPublisher` and `RedisAssistantStreamSubscriber` carry one answer from the
worker to its author's tab. The rules they keep are the application's — see
[the assistant slice](../../../application/docs/reference/assistant.md#one-log-per-answer) — and
this is how.

| Key or channel | Holds | Lives |
|---|---|---|
| `assistant:{<messageId>}` | a Redis Stream, one entry per frame, the frame's JSON in field `f` | 10 minutes from the last write |
| `assistant:{<messageId>}` (pub/sub) | `<entry id>\|<frame JSON>` | delivered once |
| `assistant:{<messageId>}:cancel` | `1` when its author pressed stop | 10 minutes |

The braces are a hash tag, so all three land on one slot when the instance becomes a Redis Cluster.

**One script appends and announces.** `XADD`, `EXPIRE` and `PUBLISH` run in one `EVAL`, and the
`PUBLISH` carries the id `XADD` just assigned. A reader that hears a frame live and also reads it
from the log therefore drops the copy by id. `RedisRealtimePublisher`'s `MULTI` cannot do this,
because inside a `MULTI` the id is not known until it ends. The channel is passed as an argument
rather than as a key, because ioredis prefixes keys and never channels.

**The reader attaches before it reads.** It subscribes first, then reads the log after the resume
point with an exclusive `XRANGE`, then yields both in order. Ids only move forward, so anything
heard live that the read already returned is skipped. It ends after `done`, when the stream's
signal aborts, or ten minutes after it opened.

**A failed publish throws**, unlike realtime's, which logs and moves on. A lost realtime frame is
a stale screen. A lost answer frame is a hole in the text, and the generation that sent it is
the one place that can stop and settle the answer.

**Which instance.** `REDIS_ASSISTANT_URL` when set. Otherwise the realtime instance, and its
subscriber connection is shared; the two listeners read disjoint channel names. Otherwise the
cache's. The cache evicts under pressure, so a production deployment that streams many answers
sets one of the first two.
