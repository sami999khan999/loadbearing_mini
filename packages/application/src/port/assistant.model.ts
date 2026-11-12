import type { CancellationSignal } from "../primitive/index.js";

export type AssistantRole = "system" | "user" | "assistant";

export interface AssistantMessage {
  readonly role: AssistantRole;
  readonly content: string;
}

export interface AssistantRequest {
  // In order. A `system` message is moved to the provider's own field by the adapter,
  // first, so the fixed prompt stays a cacheable prefix.
  readonly messages: readonly AssistantMessage[];
  readonly maxOutputTokens: number;
}

// Why the model stopped. `length` hit `maxOutputTokens`; `filtered` is the provider's own
// safety stop; `stop` is a finished answer.
export type AssistantStopReason = "stop" | "length" | "filtered";

// One piece of a streamed answer. Text arrives in order; usage and the stop reason once
// each, at the end, and an adapter that cannot read usage reports none.
export type AssistantDelta =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "usage"; readonly inputTokens: number; readonly outputTokens: number }
  | { readonly kind: "stop"; readonly reason: AssistantStopReason };

// A chat model that streams. A failure before or during the stream throws
// `RATE_LIMITED` for a 429 and `UNAVAILABLE` for everything else, both retryable.
export abstract class AssistantModel {
  // Recorded on every answer and every usage row.
  public abstract readonly model: string;
  // The context window in tokens, which the prompt builder budgets history and passages in.
  public abstract readonly contextTokens: number;

  public abstract stream(
    request: AssistantRequest,
    signal?: CancellationSignal,
  ): AsyncIterable<AssistantDelta>;
}
