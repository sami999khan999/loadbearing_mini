import {
  EmbeddingConsumer,
  MailConsumer,
  MaintenanceConsumer,
  NotificationConsumer,
  OutboxConsumer,
} from "../consumer/index.js";
import { Env } from "../env.js";
import {
  type Container,
  type QueueKey,
  QueueLimits,
  QueueName,
  type Redis,
  type Worker,
} from "../import.js";

// One queue served inside one process: the consumer that handles it, the concurrency it
// starts at, and the variable an operator changes to move that number.
export interface LaneFactory {
  readonly queue: QueueKey;
  readonly concurrency: number;
  readonly variable: string;
  start(): Worker;
}

// Every queue this build can serve, in start order. Every lane starts before the schedules
// register, so a repeatable job that fires the instant it lands has somewhere to run.
export class LaneRegistry {
  private readonly factories: readonly LaneFactory[];

  public constructor(factories: readonly LaneFactory[]) {
    this.factories = Object.freeze([...factories]);
  }

  // `connection` is a thunk so a registry can be built before Redis is reachable: nothing
  // connects until a lane starts.
  public static forContainer(container: Container, connection: () => Redis): LaneRegistry {
    const factories: readonly LaneFactory[] = [
      {
        queue: QueueName.EMBEDDING,
        concurrency: Env.embeddingConcurrency,
        variable: "WORKER_EMBEDDING_CONCURRENCY",
        start: () =>
          new EmbeddingConsumer(container, connection(), Env.embeddingConcurrency).start(),
      },
      {
        queue: QueueName.MAIL,
        concurrency: Env.mailConcurrency,
        variable: "WORKER_MAIL_CONCURRENCY",
        start: () =>
          new MailConsumer(
            container,
            connection(),
            Env.mailConcurrency,
            Env.mailRatePerMinute,
          ).start(),
      },
      {
        queue: QueueName.EVENT,
        concurrency: Env.eventConcurrency,
        variable: "WORKER_EVENT_CONCURRENCY",
        start: () => new OutboxConsumer(container, connection(), Env.eventConcurrency).start(),
      },
      {
        queue: QueueName.NOTIFICATION,
        concurrency: Env.notificationConcurrency,
        variable: "WORKER_NOTIFICATION_CONCURRENCY",
        start: () =>
          new NotificationConsumer(container, connection(), Env.notificationConcurrency).start(),
      },
      {
        queue: QueueName.MAINTENANCE,
        concurrency: Env.maintenanceConcurrency,
        variable: "WORKER_MAINTENANCE_CONCURRENCY",
        start: () =>
          new MaintenanceConsumer(container, connection(), Env.maintenanceConcurrency).start(),
      },
    ];

    return new LaneRegistry(factories);
  }

  public queues(): readonly QueueKey[] {
    return this.factories.map((factory) => factory.queue);
  }

  // The lanes `WORKER_QUEUES` names, in registry order; every lane when it is unset. A
  // name this build cannot serve throws, because a typo here is a queue nobody drains.
  public select(requested: readonly string[] | undefined): readonly LaneFactory[] {
    if (requested === undefined) return this.factories;

    const valid = this.queues();
    for (const name of requested) {
      if (!QueueLimits.isQueue(name)) {
        throw new Error(
          `WORKER_QUEUES names "${name}", which is not a queue. Use any of: ${valid.join(", ")}.`,
        );
      }
      if (!valid.includes(name)) {
        throw new Error(`WORKER_QUEUES names "${name}", which this process does not register.`);
      }
    }

    return this.factories.filter((factory) => requested.includes(factory.queue));
  }
}
