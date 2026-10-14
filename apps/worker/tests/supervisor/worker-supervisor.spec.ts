import { QueueName } from "@loadbearing/application";
import type { Worker } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { type LaneFactory, LaneRegistry, WorkerSupervisor } from "../../src/supervisor/index.js";

function lane(queue: LaneFactory["queue"], concurrency: number): LaneFactory {
  return {
    queue,
    concurrency,
    variable: `WORKER_${queue.toUpperCase()}_CONCURRENCY`,
    start: vi.fn(() => ({ name: queue, close: vi.fn(async () => undefined) }) as unknown as Worker),
  };
}

describe("WorkerSupervisor.start", () => {
  it("starts only the lanes WORKER_QUEUES names", () => {
    const mail = lane(QueueName.MAIL, 4);
    const embedding = lane(QueueName.EMBEDDING, 4);
    const supervisor = new WorkerSupervisor(new LaneRegistry([embedding, mail]), 64);

    supervisor.start(["mail"]);

    expect(supervisor.workers.map((worker) => worker.name)).toEqual(["mail"]);
    expect(embedding.start).not.toHaveBeenCalled();
  });

  it("refuses a process whose lanes add up past the ceiling, and starts none of them", () => {
    const embedding = lane(QueueName.EMBEDDING, 20);
    const event = lane(QueueName.EVENT, 20);
    const supervisor = new WorkerSupervisor(new LaneRegistry([embedding, event]), 32);

    expect(() => supervisor.start(undefined)).toThrow(
      /add up to 40, above WORKER_PROCESS_MAX_CONCURRENCY=32.*WORKER_EMBEDDING_CONCURRENCY=20/,
    );
    expect(embedding.start).not.toHaveBeenCalled();
    expect(supervisor.workers).toHaveLength(0);
  });

  it("refuses a lane above its queue's limit", () => {
    const supervisor = new WorkerSupervisor(new LaneRegistry([lane(QueueName.MAINTENANCE, 5)]), 64);

    expect(() => supervisor.start(undefined)).toThrow(/maintenance queue's limit of 4/);
  });

  it("refuses a selection that leaves the process nothing to serve", () => {
    const supervisor = new WorkerSupervisor(new LaneRegistry([]), 64);

    expect(() => supervisor.start(undefined)).toThrow(/selects no queue/);
  });

  it("closes every lane it started", async () => {
    const supervisor = new WorkerSupervisor(
      new LaneRegistry([lane(QueueName.MAIL, 1), lane(QueueName.EVENT, 1)]),
      64,
    );
    supervisor.start(undefined);

    await supervisor.close();

    for (const worker of supervisor.workers) expect(worker.close).toHaveBeenCalledTimes(1);
  });
});
