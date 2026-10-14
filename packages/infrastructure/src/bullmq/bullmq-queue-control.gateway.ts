import { Queue, type QueueControlGateway, type QueueCounts, type Redis } from "../import.js";

// BullMQ's global pause, which lives in the queue's own Redis keys: every worker obeys
// it, including one that starts after it was set.
export class BullMqQueueControlGateway implements QueueControlGateway {
  private readonly queues = new Map<string, Queue>();

  public constructor(private readonly connection: Redis) {}

  public async counts(names: readonly string[]): Promise<readonly QueueCounts[]> {
    return Promise.all(
      names.map(async (name) => {
        const queue = this.queueFor(name);
        const [counts, paused] = await Promise.all([
          queue.getJobCounts("wait", "prioritized", "paused", "active", "delayed", "failed"),
          queue.isPaused(),
        ]);
        return {
          queue: name,
          waiting: (counts.wait ?? 0) + (counts.prioritized ?? 0) + (counts.paused ?? 0),
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          paused,
        };
      }),
    );
  }

  public async pause(name: string): Promise<void> {
    await this.queueFor(name).pause();
  }

  public async resume(name: string): Promise<void> {
    await this.queueFor(name).resume();
  }

  private queueFor(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;

    const created = new Queue(name, { connection: this.connection });
    this.queues.set(name, created);
    return created;
  }

  public async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }
}
