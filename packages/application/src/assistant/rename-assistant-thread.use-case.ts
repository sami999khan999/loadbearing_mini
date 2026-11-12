import {
  type AssistantThreadDto,
  type Clock,
  NotFoundError,
  type RenameAssistantThreadInput,
  Uuid,
} from "../import.js";
import type { RealtimePublisher } from "../port/index.js";
import { type Authorizer, type Principal, RealtimeChannels } from "../primitive/index.js";
import type { AssistantThreadRepository } from "./assistant-thread.repository.js";

export class RenameAssistantThreadUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
    private readonly realtime: RealtimePublisher,
    private readonly clock: Clock,
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
    // The author's other tabs list the old title until told; a lost frame costs a refresh.
    await this.realtime
      .publish(RealtimeChannels.user(actor.organizationId, actor.userId), {
        kind: "event",
        id: Uuid.v7(),
        name: "assistant.changed",
        at: this.clock.now(),
        payload: { threadId: thread.id },
      })
      .catch(() => undefined);
    return renamed;
  }
}
