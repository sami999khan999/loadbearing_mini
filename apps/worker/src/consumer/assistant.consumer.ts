import { SystemPrincipal, withShard } from "../bootstrap/index.js";
import {
  type Container,
  type GenerateAssistantAnswerJob,
  type Job,
  QueueName,
  type Redis,
  Worker,
} from "../import.js";

// A thin adapter, exactly like an oRPC router. Everything worth testing lives in
// `GenerateAssistantAnswerUseCase`. See docs/reference/consumers.md.
export class AssistantConsumer {
  public constructor(
    private readonly container: Container,
    private readonly connection: Redis,
    private readonly concurrency: number,
    private readonly ratePerMinute: number,
    // Aborted when the process drains, never when the dashboard moves this lane away: an
    // answer cut off then is saved `interrupted`, one on a moved lane finishes.
    private readonly draining: AbortSignal,
  ) {}

  public start(): Worker {
    const worker = new Worker<GenerateAssistantAnswerJob>(
      QueueName.ASSISTANT,
      async (job, _token, signal) => this.handle(job, signal),
      {
        connection: this.connection,
        concurrency: this.concurrency,
        // The provider contract's requests a minute: a burst waits here instead of being
        // refused by the provider mid-answer.
        limiter: { max: this.ratePerMinute, duration: 60_000 },
      },
    );

    worker.on("failed", (job, error) => {
      this.container.logger.emit("queue.job.failed", {
        queue: QueueName.ASSISTANT,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });
      this.container.logger.failure(error, {
        queue: QueueName.ASSISTANT,
        jobId: job?.id ?? "unknown",
        attempt: job?.attemptsMade ?? 0,
      });
    });

    worker.on("completed", (job) => {
      this.container.logger.emit("queue.job.completed", {
        queue: QueueName.ASSISTANT,
        jobId: job.id ?? "unknown",
        durationMs: Math.max(0, (job.finishedOn ?? 0) - (job.processedOn ?? 0)),
      });
    });

    worker.on("stalled", (jobId) => {
      this.container.logger.emit("queue.job.stalled", { queue: QueueName.ASSISTANT, jobId });
    });

    return worker;
  }

  // Let it throw: a defect is settled `failed` first, and the job records why. There is no
  // retry to drive, because one would ask the provider again and bill twice.
  public async handle(job: Job<GenerateAssistantAnswerJob>, signal?: AbortSignal): Promise<void> {
    const generate = this.container.assistant.generate;
    if (!generate) throw new Error("This worker was built without an assistant model.");
    const stop = signal ? AbortSignal.any([signal, this.draining]) : this.draining;

    await withShard(this.container, job.data.organizationId, () =>
      generate.execute(SystemPrincipal.forOrganization(job.data.organizationId), job.data, stop),
    );
  }
}
