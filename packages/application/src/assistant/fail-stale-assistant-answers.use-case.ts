import type { Clock } from "../import.js";
import type { Principal } from "../primitive/index.js";
import type { AssistantMessageRepository } from "./assistant-message.repository.js";
import { SendAssistantQuestionUseCase } from "./send-assistant-question.use-case.js";

// The nightly pass, on the node in scope: an answer a worker stopped streaming and never
// settled reads as `failed` from here on, rather than as generating forever.
export class FailStaleAssistantAnswersUseCase {
  public static readonly BATCH = 500;

  public constructor(
    private readonly messages: AssistantMessageRepository,
    private readonly clock: Clock,
  ) {}

  // No permission is asserted: the caller is the worker's system principal. A statement
  // per batch, so a backlog is many short ones rather than one long lock.
  public async execute(_system: Principal): Promise<number> {
    const olderThan = new Date(this.clock.now().getTime() - SendAssistantQuestionUseCase.STALE_MS);
    let total = 0;
    for (;;) {
      const failed = await this.messages.failStale(
        olderThan,
        FailStaleAssistantAnswersUseCase.BATCH,
      );
      total += failed;
      if (failed < FailStaleAssistantAnswersUseCase.BATCH) return total;
    }
  }
}
