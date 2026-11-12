import { type Clock, type GetAssistantThreadInput, NotFoundError, Uuid } from "../import.js";
import type { ActivityLogger, RealtimePublisher, UnitOfWork } from "../port/index.js";
import { type Authorizer, type Principal, RealtimeChannels } from "../primitive/index.js";
import type { AssistantMessageRepository } from "./assistant-message.repository.js";
import type { AssistantThreadRepository } from "./assistant-thread.repository.js";

// The thread and its messages. Its `ai_usage` rows stay: the meter records what was spent,
// and a deleted conversation was still billed.
export class DeleteAssistantThreadUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
    private readonly messages: AssistantMessageRepository,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly realtime: RealtimePublisher,
    private readonly clock: Clock,
  ) {}

  // An answer still generating finds its row gone when it settles, and settles nothing.
  public async execute(actor: Principal, input: GetAssistantThreadInput): Promise<void> {
    this.authorizer.assert(actor, "ai.assistant.use");
    const thread = await this.threads.findById(actor.organizationId, actor.userId, input.threadId);
    if (!thread) throw new NotFoundError("assistant.thread", input.threadId);

    await this.unitOfWork.run(async () => {
      await this.messages.deleteByThread(actor.organizationId, thread.id);
      await this.threads.delete(actor.organizationId, thread.id);
      await this.activity.record(actor, "ai.assistant.thread.deleted", { threadId: thread.id });
    });
    // After the commit, so another tab never refetches a thread that is still there.
    await this.realtime
      .publish(RealtimeChannels.user(actor.organizationId, actor.userId), {
        kind: "event",
        id: Uuid.v7(),
        name: "assistant.changed",
        at: this.clock.now(),
        payload: { threadId: thread.id },
      })
      .catch(() => undefined);
  }
}
