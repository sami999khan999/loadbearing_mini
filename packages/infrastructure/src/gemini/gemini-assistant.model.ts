import {
  type AssistantDelta,
  AssistantModel,
  type AssistantRequest,
  type AssistantStopReason,
  type CancellationSignal,
  type Logger,
} from "../import.js";
import { ServerSentEventRequest } from "../sse/index.js";

export interface GeminiAssistantConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly endpoint?: string;
  readonly contextTokens?: number;
  readonly firstByteMs?: number;
  readonly idleMs?: number;
}

interface GenerateChunk {
  readonly candidates?: readonly {
    readonly content?: { readonly parts?: readonly { readonly text?: string }[] };
    readonly finishReason?: string;
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
  };
}

// Every reason Gemini stops for safety or policy reads as `filtered`; the rest are its
// own names for a finished or a cut-off answer.
const STOP: Readonly<Record<string, AssistantStopReason>> = Object.freeze({
  STOP: "stop",
  MAX_TOKENS: "length",
  SAFETY: "filtered",
  RECITATION: "filtered",
  BLOCKLIST: "filtered",
  PROHIBITED_CONTENT: "filtered",
  SPII: "filtered",
});

// `streamGenerateContent` with `alt=sse`. The system prompt is Gemini's own field, and an
// assistant turn is `model`. The key is a header, never the query string a log would keep.
export class GeminiAssistantModel extends AssistantModel {
  private static readonly FIRST_BYTE_MS = 30_000;
  private static readonly IDLE_MS = 20_000;

  public override readonly model: string;
  public override readonly contextTokens: number;

  public constructor(
    private readonly config: GeminiAssistantConfig,
    private readonly logger?: Logger,
  ) {
    super();
    this.model = config.model;
    this.contextTokens = config.contextTokens ?? 1_000_000;
  }

  public override async *stream(
    request: AssistantRequest,
    signal?: CancellationSignal,
  ): AsyncGenerator<AssistantDelta> {
    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const contents = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    const endpoint = this.config.endpoint ?? "https://generativelanguage.googleapis.com/v1beta";
    const events = ServerSentEventRequest.events({
      url: `${endpoint}/models/${encodeURIComponent(this.config.model)}:streamGenerateContent?alt=sse`,
      headers: { "x-goog-api-key": this.config.apiKey },
      body: {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: request.maxOutputTokens },
      },
      dependency: "gemini.chat",
      model: this.config.model,
      firstByteMs: this.config.firstByteMs ?? GeminiAssistantModel.FIRST_BYTE_MS,
      idleMs: this.config.idleMs ?? GeminiAssistantModel.IDLE_MS,
      ...(signal ? { signal } : {}),
      ...(this.logger ? { logger: this.logger } : {}),
    });

    let stop: AssistantStopReason | null = null;
    let usage: GenerateChunk["usageMetadata"] | null = null;
    for await (const event of events) {
      const chunk = JSON.parse(event.data) as GenerateChunk;
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        if (part.text) yield { kind: "text", text: part.text };
      }
      if (candidate?.finishReason) stop = STOP[candidate.finishReason] ?? "stop";
      // Running totals on every chunk: only the last is the answer's.
      if (chunk.usageMetadata) usage = chunk.usageMetadata;
    }

    if (usage) {
      yield {
        kind: "usage",
        inputTokens: usage.promptTokenCount ?? 0,
        outputTokens: usage.candidatesTokenCount ?? 0,
      };
    }
    if (stop) yield { kind: "stop", reason: stop };
  }
}
