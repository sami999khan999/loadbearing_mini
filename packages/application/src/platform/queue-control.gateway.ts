export interface QueueCounts {
  readonly queue: string;
  // Prioritized and paused jobs included: all of them are work nobody has picked up.
  readonly waiting: number;
  readonly active: number;
  readonly delayed: number;
  readonly failed: number;
  readonly paused: boolean;
}

// One queue, everywhere. A pause here is stored with the queue itself, so every process
// obeys it, including one started after the pause.
export abstract class QueueControlGateway {
  public abstract counts(queues: readonly string[]): Promise<readonly QueueCounts[]>;

  public abstract pause(queue: string): Promise<void>;

  public abstract resume(queue: string): Promise<void>;
}
