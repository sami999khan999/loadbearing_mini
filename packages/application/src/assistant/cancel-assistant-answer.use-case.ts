import { type AssistantAnswerInput, NotFoundError } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { AssistantMessageRepository } from "./assistant-message.repository.js";
import type { AssistantStreamPublisher } from "./assistant-stream.publisher.js";
import type { AssistantThreadRepository } from "./assistant-thread.repository.js";

// A stop, not a delete: the worker reads the flag between chunks and saves what it has as
// `cancelled`. An answer already settled has nothing to stop, and that is not an error.
export class CancelAssistantAnswerUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
    private readonly messages: AssistantMessageRepository,
    private readonly stream: AssistantStreamPublisher,
  ) {}

  public async execute(actor: Principal, input: AssistantAnswerInput): Promise<void> {
    this.authorizer.assert(actor, "ai.assistant.use");
    const thread = await this.threads.findById(actor.organizationId, actor.userId, input.threadId);
    if (!thread) throw new NotFoundError("assistant.thread", input.threadId);

    const answer = await this.messages.findInThread(
      actor.organizationId,
      thread.id,
      input.messageId,
    );
    if (answer?.role !== "assistant") {
      throw new NotFoundError("assistant.message", input.messageId);
    }
    if (answer.status === "pending") await this.stream.requestCancel(answer.id);
  }
}
