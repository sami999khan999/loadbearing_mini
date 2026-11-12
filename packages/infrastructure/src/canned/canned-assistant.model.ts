import {
  type AssistantDelta,
  AssistantModel,
  type AssistantRequest,
  type CancellationSignal,
} from "../import.js";

export interface CannedAssistantConfig {
  // Between two pieces of the answer, so a load test sees a stream's shape and duration.
  readonly delayMs?: number;
}

// `ASSISTANT_PROVIDER=fake`: a deterministic answer streamed word by word, calling nobody.
// For the load test and local work without a key; never a quality signal.
export class CannedAssistantModel extends AssistantModel {
  public override readonly model = "canned";
  public override readonly contextTokens = 32_000;

  public constructor(private readonly config: CannedAssistantConfig = {}) {
    super();
  }

  public override async *stream(
    request: AssistantRequest,
    signal?: CancellationSignal,
  ): AsyncGenerator<AssistantDelta> {
    const question = [...request.messages].reverse().find((message) => message.role === "user");
    // The question alone: the turn opens with the fenced passages, which are not the ask.
    const asked = (question?.content ?? "").split("Question: ").at(-1) ?? "";
    const answer = `This is a canned answer to: ${asked}`;
    const words = answer.split(/(?<= )/);
    let written = 0;

    for (const word of words) {
      if (signal?.aborted) return;
      if (written >= request.maxOutputTokens) {
        yield { kind: "stop", reason: "length" };
        return;
      }
      if (this.config.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.config.delayMs));
      }
      yield { kind: "text", text: word };
      written += 1;
    }

    // One token a word: the fake has no tokeniser, and the meter only needs to move.
    const inputTokens = request.messages.reduce(
      (sum, message) => sum + message.content.split(/\s+/).length,
      0,
    );
    yield { kind: "usage", inputTokens, outputTokens: written };
    yield { kind: "stop", reason: "stop" };
  }
}
