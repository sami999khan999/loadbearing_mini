import { QueueLimits, type Worker } from "../import.js";
import type { LaneRegistry } from "./lane-registry.js";

// Owns the lanes one worker process runs, fixed at boot from `WORKER_QUEUES`. See
// docs/reference/supervisor.md.
export class WorkerSupervisor {
  private readonly lanes: Worker[] = [];

  public constructor(
    private readonly registry: LaneRegistry,
    private readonly processMaxConcurrency: number,
  ) {}

  public get workers(): readonly Worker[] {
    return this.lanes;
  }

  // Every ceiling is checked before the first lane starts: a refusal halfway through would
  // leave a process consuming some queues and exiting on the rest.
  public start(requested: readonly string[] | undefined): readonly Worker[] {
    const selected = this.registry.select(requested);
    if (selected.length === 0) {
      throw new Error("WORKER_QUEUES selects no queue. Name at least one, or unset it.");
    }

    for (const lane of selected) {
      const max = QueueLimits.maxFor(lane.queue);
      if (lane.concurrency > max) {
        throw new Error(
          `${lane.variable}=${lane.concurrency} is above the ${lane.queue} queue's limit of ${max}.`,
        );
      }
    }

    const total = selected.reduce((sum, lane) => sum + lane.concurrency, 0);
    if (total > this.processMaxConcurrency) {
      const variables = selected.map((lane) => `${lane.variable}=${lane.concurrency}`).join(", ");
      throw new Error(
        `These lanes add up to ${total}, above WORKER_PROCESS_MAX_CONCURRENCY=${this.processMaxConcurrency}. Lower one of ${variables}, or split the queues across services with WORKER_QUEUES.`,
      );
    }

    for (const lane of selected) this.lanes.push(lane.start());
    return this.lanes;
  }

  // `close()` waits for each lane's active jobs. The caller races it against the
  // shutdown timeout; see docs/reference/shutdown.md.
  public async close(): Promise<void> {
    await Promise.all(this.lanes.map((worker) => worker.close()));
  }
}
