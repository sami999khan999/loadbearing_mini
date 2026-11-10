import {
  type AssistantThreadDetail,
  type GetAssistantThreadInput,
  NotFoundError,
} from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { AssistantMessageRepository } from "./assistant-message.repository.js";
import type { AssistantRetrieval } from "./assistant-retrieval.js";
import type { AssistantThreadRepository } from "./assistant-thread.repository.js";

// The thread as its author reads it now. Every saved source is checked again, so a page
// they lost access to since the answer shows as unavailable rather than as a link.
export class GetAssistantThreadUseCase {
  // The latest this many; a thread longer than that shows its tail.
  public static readonly MESSAGES = 100;

  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
    private readonly messages: AssistantMessageRepository,
    private readonly retrieval: AssistantRetrieval,
  ) {}

  public async execute(
    actor: Principal,
    input: GetAssistantThreadInput,
  ): Promise<AssistantThreadDetail> {
    this.authorizer.assert(actor, "ai.assistant.use");
    const thread = await this.threads.findById(actor.organizationId, actor.userId, input.threadId);
    if (!thread) throw new NotFoundError("assistant.thread", input.threadId);

    const messages = await this.messages.listByThread(
      actor.organizationId,
      thread.id,
      GetAssistantThreadUseCase.MESSAGES,
    );
    // One pass over every source in the thread, so a space is resolved once, not per answer.
    const available = await this.retrieval.available(
      actor,
      messages.flatMap((message) => message.sources),
    );

    let next = 0;
    return {
      thread,
      messages: messages.map((message) => ({
        ...message,
        sources: message.sources.map((source) => ({
          ...source,
          available: available[next++] ?? false,
        })),
      })),
    };
  }
}
