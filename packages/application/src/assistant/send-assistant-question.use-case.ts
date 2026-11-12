import {
  type AssistantSent,
  type Clock,
  NotFoundError,
  RateLimitedError,
  type SendAssistantQuestionInput,
  Uuid,
} from "../import.js";
import type { ActivityLogger, QueuePublisher, UnitOfWork } from "../port/index.js";
import { type Authorizer, type Principal, QueueName } from "../primitive/index.js";
import type { AssistantBudget } from "./assistant-budget.rules.js";
import type { AssistantMessageRepository } from "./assistant-message.repository.js";
import type {
  AssistantThreadRecord,
  AssistantThreadRepository,
} from "./assistant-thread.repository.js";

// What the `assistant` lane's consumer receives. Ids only: the question is read back from
// Postgres, so no message text sits in Redis for the life of a job.
export interface GenerateAssistantAnswerJob {
  readonly organizationId: string;
  readonly threadId: string;
  readonly messageId: string;
  readonly authorId: string;
}

export interface AssistantLimits {
  // How many answers one person may have generating at once.
  readonly activePerUser: number;
  // False under `ASSISTANT_PROVIDER=none`: the feature is absent, so it answers NOT_FOUND.
  readonly enabled: boolean;
}

const TITLE_LENGTH = 80;

export class SendAssistantQuestionUseCase {
  // An answer `pending` longer than this is stuck, not generating: it stops counting
  // against its asker, and the nightly sweep settles it `failed`.
  public static readonly STALE_MS = 10 * 60_000;

  public constructor(
    private readonly authorizer: Authorizer,
    private readonly threads: AssistantThreadRepository,
    private readonly messages: AssistantMessageRepository,
    private readonly budget: AssistantBudget,
    private readonly queue: QueuePublisher,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly limits: AssistantLimits,
  ) {}

  public async execute(
    actor: Principal,
    input: SendAssistantQuestionInput,
  ): Promise<AssistantSent> {
    this.authorizer.assert(actor, "ai.assistant.use");
    if (!this.limits.enabled) throw new NotFoundError("assistant", "provider");

    const now = this.clock.now();
    const existing = input.threadId
      ? await this.threads.findById(actor.organizationId, actor.userId, input.threadId)
      : null;
    if (input.threadId && !existing) throw new NotFoundError("assistant.thread", input.threadId);

    // Cheapest first: a count off the partial `pending` index, then one Redis read.
    const since = new Date(now.getTime() - SendAssistantQuestionUseCase.STALE_MS);
    const active = await this.messages.countPending(actor.organizationId, actor.userId, since);
    if (active >= this.limits.activePerUser) throw new RateLimitedError("assistant.active");
    await this.budget.assertAvailable(actor.organizationId);

    const thread: AssistantThreadRecord = existing ?? {
      id: Uuid.v7(),
      organizationId: actor.organizationId,
      authorId: actor.userId,
      title: SendAssistantQuestionUseCase.title(input.question),
      createdAt: now,
      updatedAt: now,
    };
    const questionId = Uuid.v7();
    const messageId = Uuid.v7();
    // A millisecond apart, so the thread reads question then answer by time alone.
    const answeredAt = new Date(now.getTime() + 1);

    // No activity row per question: volume is not an audit trail, and `ai_usage` meters it.
    await this.unitOfWork.run(async () => {
      if (existing) await this.threads.touch(actor.organizationId, thread.id, now);
      else {
        await this.threads.save(thread);
        await this.activity.record(actor, "ai.assistant.thread.created", { threadId: thread.id });
      }
      await this.messages.insert({
        id: questionId,
        organizationId: actor.organizationId,
        threadId: thread.id,
        authorId: actor.userId,
        role: "user",
        content: input.question,
        status: "complete",
        sources: [],
        model: null,
        createdAt: now,
        completedAt: now,
      });
      await this.messages.insert({
        id: messageId,
        organizationId: actor.organizationId,
        threadId: thread.id,
        authorId: actor.userId,
        role: "assistant",
        content: "",
        status: "pending",
        sources: [],
        model: null,
        createdAt: answeredAt,
        completedAt: null,
      });
    });

    // After the commit, so the consumer never reads before the rows exist. One attempt:
    // a retry would ask the provider again and bill twice. A lost publish is swept `failed`.
    await this.queue.publish<GenerateAssistantAnswerJob>(
      QueueName.ASSISTANT,
      {
        organizationId: actor.organizationId,
        threadId: thread.id,
        messageId,
        authorId: actor.userId,
      },
      { inFlightId: messageId, attempts: 1 },
    );

    return { threadId: thread.id, questionId, messageId };
  }

  // The question's first line, cut at a word. Renamed by its author whenever they like.
  private static title(question: string): string {
    const line = question.trim().split("\n")[0] ?? "";
    if (line.length <= TITLE_LENGTH) return line;
    const cut = line.slice(0, TITLE_LENGTH);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 1))}…`;
  }
}
