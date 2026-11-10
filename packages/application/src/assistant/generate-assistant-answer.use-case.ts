import {
  type Clock,
  type OrganizationId,
  RateLimitedError,
  UnavailableError,
  type UserId,
  Uuid,
} from "../import.js";
import type {
  AssistantModel,
  AssistantRequest,
  RealtimePublisher,
  TenantMembershipReader,
  UnitOfWork,
} from "../port/index.js";
import { type CancellationSignal, Principal, RealtimeChannels } from "../primitive/index.js";
import type { CapabilityRepository } from "../rbac/index.js";
import type { AssistantBudget } from "./assistant-budget.rules.js";
import type {
  AssistantMessageRecord,
  AssistantMessageRepository,
  AssistantMessageStatus,
  AssistantSource,
} from "./assistant-message.repository.js";
import { AssistantPromptBuilder } from "./assistant-prompt.builder.js";
import type { AssistantRetrieval } from "./assistant-retrieval.js";
import type { AssistantStreamPublisher } from "./assistant-stream.publisher.js";
import type { AssistantThreadRepository } from "./assistant-thread.repository.js";
import type { AssistantUsageRepository } from "./assistant-usage.repository.js";
import type { GenerateAssistantAnswerJob } from "./send-assistant-question.use-case.js";

// Text is sent on whichever comes first: a frame per token would be a Redis write per token.
const FLUSH_CHARS = 64;
const FLUSH_MS = 100;
// The stop flag is a Redis read, so it is asked at most this often, not on every frame.
const CANCEL_CHECK_MS = 500;
// The thread's tail the prompt is built from; the builder keeps what fits its window.
const HISTORY = 40;

type Settled = Exclude<AssistantMessageStatus, "pending">;

interface Outcome {
  readonly status: Settled;
  readonly content: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly called: boolean;
  // A throw that was neither the provider's refusal nor its outage: a defect, rethrown
  // once the answer is settled so its asker is not left waiting on it.
  readonly defect?: Error;
}

// The `assistant` lane's work: one answer, generated as its asker, streamed to their log,
// and settled once. See packages/application/docs/reference/assistant.md.
export class GenerateAssistantAnswerUseCase {
  public constructor(
    private readonly threads: AssistantThreadRepository,
    private readonly messages: AssistantMessageRepository,
    private readonly usage: AssistantUsageRepository,
    private readonly members: TenantMembershipReader,
    private readonly capabilities: CapabilityRepository,
    private readonly retrieval: AssistantRetrieval,
    private readonly model: AssistantModel,
    private readonly stream: AssistantStreamPublisher,
    private readonly realtime: RealtimePublisher,
    private readonly budget: AssistantBudget,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly maxOutputTokens: number,
  ) {}

  // `system` is the worker's principal and asserts nothing: the job names the asker, and
  // every search below runs as them. `signal` aborts on drain; the answer is `interrupted`.
  public async execute(
    _system: Principal,
    job: GenerateAssistantAnswerJob,
    signal?: CancellationSignal,
  ): Promise<Settled | null> {
    const organizationId = job.organizationId as OrganizationId;
    const thread = await this.messages.listByThread(organizationId, job.threadId, HISTORY);
    const at = thread.findIndex((message) => message.id === job.messageId);
    const answer = thread[at];
    // Gone with its thread, or settled by a run before this one: nothing left to do.
    if (answer?.status !== "pending") return null;

    const asker = await this.askerOf(organizationId, job.authorId as UserId);
    const before = thread.slice(0, at);
    const asked = before.findLastIndex((message) => message.role === "user");
    const question = before[asked];
    if (!asker || !question) {
      return this.settle(answer, [], { ...GenerateAssistantAnswerUseCase.empty, status: "failed" });
    }

    const found = await this.retrieval.find(asker, question.content);
    const request = AssistantPromptBuilder.build({
      question: question.content,
      history: before.slice(0, asked),
      passages: found.passages,
      contextTokens: this.model.contextTokens,
      maxOutputTokens: this.maxOutputTokens,
    });
    const outcome = await this.generate(answer.id, request, signal);
    const settled = await this.settle(answer, found.sources, outcome);
    if (outcome.defect !== undefined) throw outcome.defect;
    return settled;
  }

  // Only the asker's own rows: a member removed since they asked is no principal at all.
  private async askerOf(organizationId: OrganizationId, userId: UserId): Promise<Principal | null> {
    if (!(await this.members.isActiveMember(organizationId, userId))) return null;
    const granted = await this.capabilities.resolveFor(organizationId, userId);
    const asker = new Principal(organizationId, userId, granted, "user");
    return asker.can("ai.assistant.use") ? asker : null;
  }

  private async generate(
    messageId: string,
    request: AssistantRequest,
    signal: CancellationSignal | undefined,
  ): Promise<Outcome> {
    let content = "";
    let pending = "";
    let flushedAt = this.clock.now().getTime();
    let checkedAt = flushedAt;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let status: Settled = "complete";
    let defect: Error | undefined;

    const flush = async (): Promise<void> => {
      if (pending.length === 0) return;
      await this.stream.publish(messageId, { kind: "text", text: pending });
      pending = "";
      flushedAt = this.clock.now().getTime();
    };

    try {
      for await (const delta of this.model.stream(request, signal)) {
        if (delta.kind === "usage") {
          inputTokens = delta.inputTokens;
          outputTokens = delta.outputTokens;
          continue;
        }
        if (delta.kind !== "text") continue;

        content += delta.text;
        pending += delta.text;
        const now = this.clock.now().getTime();
        if (pending.length >= FLUSH_CHARS || now - flushedAt >= FLUSH_MS) await flush();
        if (now - checkedAt >= CANCEL_CHECK_MS) {
          checkedAt = now;
          // Breaking out returns the adapter's iterator, which aborts its request.
          if (await this.stream.isCancelRequested(messageId)) {
            status = "cancelled";
            break;
          }
        }
      }
      if (status === "complete" && (await this.stream.isCancelRequested(messageId))) {
        status = "cancelled";
      }
    } catch (error) {
      status = signal?.aborted ? "interrupted" : "failed";
      if (!(error instanceof RateLimitedError || error instanceof UnavailableError)) {
        defect = error instanceof Error ? error : new Error(String(error));
      }
    }
    // What streamed before a stop is kept, so the saved answer matches what was on screen.
    await flush().catch(() => undefined);
    if (status === "complete" && signal?.aborted) status = "interrupted";

    return {
      status,
      content,
      called: true,
      inputTokens: inputTokens ?? GenerateAssistantAnswerUseCase.inputEstimate(request),
      outputTokens: outputTokens ?? AssistantPromptBuilder.estimate(content),
      ...(defect === undefined ? {} : { defect }),
    };
  }

  // One short transaction, then what only matters if it won: the meter, the budget, the
  // frame that ends the stream and the one invalidation the author's other tabs refetch on.
  private async settle(
    answer: AssistantMessageRecord,
    sources: readonly AssistantSource[],
    outcome: Outcome,
  ): Promise<Settled> {
    const completedAt = this.clock.now();
    const kept = outcome.status === "failed" && outcome.content.length === 0 ? [] : sources;

    const won = await this.unitOfWork.run(async () => {
      const settled = await this.messages.settle(
        answer.organizationId,
        answer.threadId,
        answer.id,
        {
          content: outcome.content,
          status: outcome.status,
          sources: kept,
          model: outcome.called ? this.model.model : null,
          completedAt,
        },
      );
      if (!settled) return false;
      if (outcome.called) {
        await this.usage.save({
          id: Uuid.v7(),
          organizationId: answer.organizationId,
          userId: answer.authorId,
          threadId: answer.threadId,
          messageId: answer.id,
          model: this.model.model,
          inputTokens: outcome.inputTokens,
          outputTokens: outcome.outputTokens,
          createdAt: completedAt,
        });
      }
      await this.threads.touch(answer.organizationId, answer.threadId, completedAt);
      return true;
    });

    if (won && outcome.called) {
      await this.budget.charge(answer.organizationId, outcome.inputTokens + outcome.outputTokens);
    }
    await this.stream.publish(answer.id, {
      kind: "done",
      status: outcome.status,
      sources: kept.map((source) => ({ ...source, available: true })),
    });
    await this.realtime
      .publish(RealtimeChannels.user(answer.organizationId, answer.authorId), {
        kind: "event",
        id: Uuid.v7(),
        name: "assistant.changed",
        at: completedAt,
        payload: { threadId: answer.threadId, messageId: answer.id },
      })
      .catch(() => undefined);
    return outcome.status;
  }

  private static readonly empty: Outcome = Object.freeze({
    status: "failed",
    content: "",
    inputTokens: 0,
    outputTokens: 0,
    called: false,
  });

  // What the provider would have counted, when it reported nothing: the whole prompt.
  private static inputEstimate(request: AssistantRequest): number {
    return request.messages.reduce(
      (total, message) => total + AssistantPromptBuilder.estimate(message.content),
      0,
    );
  }
}
