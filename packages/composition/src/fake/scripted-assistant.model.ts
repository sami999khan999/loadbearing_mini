import {
  type AssistantDelta,
  AssistantModel,
  type AssistantRequest,
  type CancellationSignal,
} from "../import.js";

// Replays the deltas a spec scripts, and records every request, so a use-case spec asserts
// what the model was asked and what it does with each kind of answer, a throw included.
export class ScriptedAssistantModel extends AssistantModel {
  public override readonly model = "scripted";
  public override readonly contextTokens = 32_000;
  public readonly requests: AssistantRequest[] = [];

  public constructor(
    private readonly script: readonly AssistantDelta[] = [
      { kind: "text", text: "scripted answer" },
      { kind: "usage", inputTokens: 10, outputTokens: 2 },
      { kind: "stop", reason: "stop" },
    ],
    private readonly failAfter?: { readonly deltas: number; readonly error: Error },
  ) {
    super();
  }

  public override async *stream(
    request: AssistantRequest,
    signal?: CancellationSignal,
  ): AsyncGenerator<AssistantDelta> {
    this.requests.push(request);
    for (const [index, delta] of this.script.entries()) {
      if (this.failAfter && index === this.failAfter.deltas) throw this.failAfter.error;
      // A turn of the event loop per delta, as a network gives: a consumer that cancels
      // between two deltas must get the chance to.
      await Promise.resolve();
      if (signal?.aborted) return;
      yield delta;
    }
  }
}
