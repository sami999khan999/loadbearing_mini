import { type AssistantAnswerInput, type AssistantFrame, NotFoundError } from "../import.js";
import type { Authorizer, CancellationSignal, Principal } from "../primitive/index.js";
import type { AssistantMessageRepository } from "./assistant-message.repository.js";
import type { AssistantRetrieval } from "./assistant-retrieval.js";
import type { AssistantStreamSubscriber } from "./assistant-stream.subscriber.js";
import type { AssistantThreadRepository } from "./assistant-thread.repository.js";

// The id of the `done` frame an already settled answer is answered with. It names no log
// entry, so a resume from it reads the settled row again rather than a log that expired.
const SETTLED = "settled";

// One answer's frames to its author. Authorship is checked before the log is opened, so
// nobody else's answer reaches Redis; a settled answer is one `done` and nothing more.
export class StreamAssistantAnswerUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
    private readonly messages: AssistantMessageRepository,
    private readonly retrieval: AssistantRetrieval,
    private readonly subscriber: AssistantStreamSubscriber,
  ) {}

  public async *execute(
    actor: Principal,
    input: AssistantAnswerInput,
    signal: CancellationSignal,
    after?: string,
  ): AsyncGenerator<AssistantFrame> {
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

    if (answer.status !== "pending") {
      const available = await this.retrieval.available(actor, answer.sources);
      yield {
        kind: "done",
        id: SETTLED,
        status: answer.status,
        sources: answer.sources.map((source, index) => ({
          ...source,
          available: available[index] ?? false,
        })),
      };
      return;
    }

    yield* this.subscriber.subscribe(answer.id, signal, after === SETTLED ? undefined : after);
  }
}
