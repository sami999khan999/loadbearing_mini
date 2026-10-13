import { QueueName } from "./queue-name.js";

export type QueueKey = (typeof QueueName.ALL)[number];

// The most one worker process may run of each queue, whatever the environment asks for.
// Ceilings, not defaults: the worker's env sets the starting values.
const LIMITS: Readonly<Record<QueueKey, number>> = Object.freeze({
  [QueueName.EMBEDDING]: 32,
  [QueueName.NOTIFICATION]: 16,
  // Table-level locks. A handful is the most that is ever safe on one partition set.
  [QueueName.MAINTENANCE]: 4,
  [QueueName.MAIL]: 32,
  [QueueName.EVENT]: 64,
});

export class QueueLimits {
  private constructor() {}

  public static maxFor(queue: QueueKey): number {
    return LIMITS[queue];
  }

  public static isQueue(name: string): name is QueueKey {
    return (QueueName.ALL as readonly string[]).includes(name);
  }
}
