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
