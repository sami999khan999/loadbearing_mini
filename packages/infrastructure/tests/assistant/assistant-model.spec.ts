import type { AssistantDelta, AssistantRequest } from "@loadbearing/application";
import { RateLimitedError, UnavailableError } from "@loadbearing/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CannedAssistantModel } from "../../src/canned/index.js";
import { GeminiAssistantModel } from "../../src/gemini/index.js";
import { OpenAiAssistantModel } from "../../src/openai/index.js";

// The three adapters behind `AssistantModel`, against recorded streams: one spec, because
// the contract they share — deltas, stop reasons, usage, errors — is the subject.

const REQUEST: AssistantRequest = {
  messages: [
    { role: "system", content: "Answer from the passages." },
    { role: "user", content: "How often are keys rotated?" },
    { role: "assistant", content: "Quarterly." },
    { role: "user", content: "And who does it?" },
  ],
  maxOutputTokens: 256,
};

interface Sent {
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: Record<string, unknown>;
}

const sse = (...events: readonly string[]) =>
  new Response(events.map((data) => `data: ${data}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

const answering = (response: () => Response) => {
  const sent: Sent[] = [];
  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    sent.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
    });
    return Promise.resolve(response());
  });
  return sent;
};

const collect = async (deltas: AsyncIterable<AssistantDelta>) => {
  const out: AssistantDelta[] = [];
  for await (const delta of deltas) out.push(delta);
  return out;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAiAssistantModel", () => {
  const model = (endpoint?: string) =>
    new OpenAiAssistantModel({ apiKey: "sk", model: "gpt-x", ...(endpoint ? { endpoint } : {}) });

  it("streams text, then usage, then the stop reason", async () => {
    answering(() =>
      sse(
        JSON.stringify({ choices: [{ delta: { content: "The " } }] }),
        JSON.stringify({ choices: [{ delta: { content: "platform team." } }] }),
        JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] }),
        JSON.stringify({ choices: [], usage: { prompt_tokens: 40, completion_tokens: 3 } }),
        "[DONE]",
      ),
    );

    expect(await collect(model().stream(REQUEST))).toEqual([
      { kind: "text", text: "The " },
      { kind: "text", text: "platform team." },
      { kind: "usage", inputTokens: 40, outputTokens: 3 },
      { kind: "stop", reason: "stop" },
    ]);
  });

  it("sends the messages in order, with usage asked for and the token cap", async () => {
    const sent = answering(() => sse("[DONE]"));

    await collect(model().stream(REQUEST));

    expect(sent[0]?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(sent[0]?.headers.authorization).toBe("Bearer sk");
    expect(sent[0]?.body).toMatchObject({
      model: "gpt-x",
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 256,
      messages: REQUEST.messages,
    });
  });

  it("serves OpenRouter at its endpoint, and reads a provider error inside the stream", async () => {
    const sent = answering(() => sse(JSON.stringify({ error: { message: "upstream down" } })));

    await expect(
      collect(model("https://openrouter.ai/api/v1").stream(REQUEST)),
    ).rejects.toBeInstanceOf(UnavailableError);
    expect(sent[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  });

  it("maps a 429 to RATE_LIMITED and any other refusal to UNAVAILABLE", async () => {
    answering(() => new Response("slow down", { status: 429 }));
    await expect(collect(model().stream(REQUEST))).rejects.toBeInstanceOf(RateLimitedError);

    answering(() => new Response("broken", { status: 500 }));
    await expect(collect(model().stream(REQUEST))).rejects.toBeInstanceOf(UnavailableError);
  });

  it("reads a cut-off answer as length and a filtered one as filtered", async () => {
    answering(() => sse(JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] })));
    expect((await collect(model().stream(REQUEST))).at(-1)).toEqual({
      kind: "stop",
      reason: "length",
    });

    answering(() =>
      sse(JSON.stringify({ choices: [{ delta: {}, finish_reason: "content_filter" }] })),
    );
    expect((await collect(model().stream(REQUEST))).at(-1)).toEqual({
      kind: "stop",
      reason: "filtered",
    });
  });

  // A stream that stops sending is a stalled connection, never a hang.
  it("fails a stream that goes idle past its window", async () => {
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`,
            ),
          );
          init.signal?.addEventListener("abort", () => controller.error(new Error("aborted")));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });

    const stalled = new OpenAiAssistantModel({ apiKey: "sk", model: "gpt-x", idleMs: 20 });
    await expect(collect(stalled.stream(REQUEST))).rejects.toBeInstanceOf(UnavailableError);
  });

  // A stop pressed by the reader ends the stream with what it had, and is no failure.
  it("ends quietly when the caller cancels", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: "a" } }] })}\n\n`,
            ),
          );
          init.signal?.addEventListener("abort", () => stream.error(new Error("aborted")));
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });

    const out: AssistantDelta[] = [];
    for await (const delta of model().stream(REQUEST, controller.signal)) {
      out.push(delta);
      controller.abort();
    }

    expect(out).toEqual([{ kind: "text", text: "a" }]);
  });
});

describe("GeminiAssistantModel", () => {
  const model = () => new GeminiAssistantModel({ apiKey: "g-key", model: "gemini-2.5-flash" });

  it("moves the system prompt to its own field and names an assistant turn model", async () => {
    const sent = answering(() => sse(JSON.stringify({ candidates: [{ finishReason: "STOP" }] })));

    await collect(model().stream(REQUEST));

    expect(sent[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
    );
    expect(sent[0]?.headers["x-goog-api-key"]).toBe("g-key");
    expect(sent[0]?.body).toEqual({
      systemInstruction: { parts: [{ text: "Answer from the passages." }] },
      contents: [
        { role: "user", parts: [{ text: "How often are keys rotated?" }] },
        { role: "model", parts: [{ text: "Quarterly." }] },
        { role: "user", parts: [{ text: "And who does it?" }] },
      ],
      generationConfig: { maxOutputTokens: 256 },
    });
  });

  it("streams parts, reports the last usage once, and maps a safety stop to filtered", async () => {
    answering(() =>
      sse(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "The " }] } }],
          usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 1 },
        }),
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "team." }] }, finishReason: "SAFETY" }],
          usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 2 },
        }),
      ),
    );

    expect(await collect(model().stream(REQUEST))).toEqual([
      { kind: "text", text: "The " },
      { kind: "text", text: "team." },
      { kind: "usage", inputTokens: 40, outputTokens: 2 },
      { kind: "stop", reason: "filtered" },
    ]);
  });

  it("maps a 429 to RATE_LIMITED", async () => {
    answering(() => new Response("quota", { status: 429 }));
    await expect(collect(model().stream(REQUEST))).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("CannedAssistantModel", () => {
  it("answers the last question word by word, with usage and a stop, calling nobody", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const out = await collect(new CannedAssistantModel().stream(REQUEST));
    const text = out.flatMap((delta) => (delta.kind === "text" ? [delta.text] : [])).join("");

    expect(text).toBe("This is a canned answer to: And who does it?");
    expect(out.at(-1)).toEqual({ kind: "stop", reason: "stop" });
    expect(out.some((delta) => delta.kind === "usage")).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops at the output cap with length", async () => {
    const out = await collect(
      new CannedAssistantModel().stream({ ...REQUEST, maxOutputTokens: 2 }),
    );
    expect(out.filter((delta) => delta.kind === "text")).toHaveLength(2);
    expect(out.at(-1)).toEqual({ kind: "stop", reason: "length" });
  });
});
