import {
  type AssistantThreadDto,
  NotFoundError,
  type RenameAssistantThreadInput,
} from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { AssistantThreadRepository } from "./assistant-thread.repository.js";

export class RenameAssistantThreadUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
  ) {}

  // The title only: the time a thread sorts by is its last message's, not its last rename's.
  public async execute(
    actor: Principal,
    input: RenameAssistantThreadInput,
  ): Promise<AssistantThreadDto> {
    this.authorizer.assert(actor, "ai.assistant.use");
    const thread = await this.threads.findById(actor.organizationId, actor.userId, input.threadId);
    if (!thread) throw new NotFoundError("assistant.thread", input.threadId);

    const renamed = { ...thread, title: input.title };
    await this.threads.save(renamed);
    return renamed;
  }
}
