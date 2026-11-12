import {
  type AssistantDelta,
  AssistantModel,
  type AssistantRequest,
  type AssistantStopReason,
  type CancellationSignal,
  type Logger,
  UnavailableError,
} from "../import.js";
import { ServerSentEventRequest } from "../sse/index.js";

export interface OpenAiAssistantConfig {
  readonly apiKey: string;
  readonly model: string;
  // `https://api.openai.com/v1` by default; OpenRouter is `https://openrouter.ai/api/v1`.
  readonly endpoint?: string;
  readonly contextTokens?: number;
  // OpenRouter's attribution headers; OpenAI ignores both.
  readonly referer?: string;
  readonly title?: string;
  readonly firstByteMs?: number;
  readonly idleMs?: number;
}

interface ChatChunk {
  readonly choices?: readonly {
    readonly delta?: { readonly content?: string | null };
    readonly finish_reason?: string | null;
  }[];
  readonly usage?: { readonly prompt_tokens?: number; readonly completion_tokens?: number } | null;
  readonly error?: { readonly message?: string };
}

const STOP: Readonly<Record<string, AssistantStopReason>> = Object.freeze({
  stop: "stop",
  length: "length",
  content_filter: "filtered",
});

// OpenAI's Chat Completions stream, which OpenRouter serves too: the same body, the same
// chunks, a different endpoint. `fetch`, not an SDK. See docs/reference/assistant.md.
export class OpenAiAssistantModel extends AssistantModel {
  // A reasoning model may think for a while before its first token; an idle stream of
  // that length after it has started is a stalled connection.
  private static readonly FIRST_BYTE_MS = 30_000;
  private static readonly IDLE_MS = 20_000;

  public override readonly model: string;
  public override readonly contextTokens: number;

  public constructor(
    private readonly config: OpenAiAssistantConfig,
    private readonly logger?: Logger,
  ) {
    super();
    this.model = config.model;
    this.contextTokens = config.contextTokens ?? 128_000;
  }

  public override async *stream(
    request: AssistantRequest,
    signal?: CancellationSignal,
  ): AsyncGenerator<AssistantDelta> {
    const openRouter = this.config.endpoint?.includes("openrouter.ai") ?? false;
    const events = ServerSentEventRequest.events({
      url: `${this.config.endpoint ?? "https://api.openai.com/v1"}/chat/completions`,
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        ...(this.config.referer ? { "http-referer": this.config.referer } : {}),
        ...(this.config.title ? { "x-title": this.config.title } : {}),
      },
      body: {
        model: this.config.model,
        stream: true,
        // The usage arrives as one last chunk with no choices, which is what meters it.
        stream_options: { include_usage: true },
        // `max_tokens`, which both providers read; OpenAI's newer name is not OpenRouter's.
        max_tokens: request.maxOutputTokens,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      },
      dependency: openRouter ? "openrouter.chat" : "openai.chat",
      model: this.config.model,
      firstByteMs: this.config.firstByteMs ?? OpenAiAssistantModel.FIRST_BYTE_MS,
      idleMs: this.config.idleMs ?? OpenAiAssistantModel.IDLE_MS,
      ...(signal ? { signal } : {}),
      ...(this.logger ? { logger: this.logger } : {}),
    });

    let stop: AssistantStopReason | null = null;
    for await (const event of events) {
      if (event.data === "[DONE]") break;
      const chunk = JSON.parse(event.data) as ChatChunk;
      // OpenRouter reports a provider failure inside the stream, after a 200.
      if (chunk.error) throw new UnavailableError(openRouter ? "openrouter.chat" : "openai.chat");

      const choice = chunk.choices?.[0];
      const text = choice?.delta?.content;
      if (text) yield { kind: "text", text };
      if (choice?.finish_reason) stop = STOP[choice.finish_reason] ?? "stop";

      if (chunk.usage) {
        yield {
          kind: "usage",
          inputTokens: chunk.usage.prompt_tokens ?? 0,
          outputTokens: chunk.usage.completion_tokens ?? 0,
        };
      }
    }

    if (stop) yield { kind: "stop", reason: stop };
  }
}
