import { Env } from "../env.js";
import { type Container, QueueName, type RedisConnection } from "../import.js";
import {
  CleanupSchedule,
  DigestSchedule,
  OrphansSchedule,
  OutboxDrainSchedule,
  PartitionsSchedule,
  RetentionSchedule,
  SparesSchedule,
} from "../schedule/index.js";
import { LaneRegistry, WorkerSupervisor } from "../supervisor/index.js";

export class WorkerBootstrap {
  private readonly supervisor: WorkerSupervisor;
  private draining: Promise<void> | null = null;
  // Aborted first thing in a drain, so the answers in flight stop and save what they have.
  private readonly stopping = new AbortController();

  public constructor(
    private readonly container: Container,
    private readonly redis: RedisConnection,
  ) {
    this.supervisor = new WorkerSupervisor(
      LaneRegistry.forContainer(container, () => redis.queueClient(), this.stopping.signal),
      Env.processMaxConcurrency,
    );
  }

  public async start(): Promise<void> {
    // Before the schedules register. Mail is in the default list, and a process that leaves
    // it out needs another service that serves it: every sign-up's mail is a job.
    this.supervisor.start(Env.queues);

    // Once at boot, before the schedules: the monthly cron only helps a worker that was
    // awake on the first, and the runway running out is every write in the system failing.
    await new PartitionsSchedule(this.container, this.redis.queueClient()).runOnce();

    await new OutboxDrainSchedule(this.container, this.redis.queueClient()).register();
    await new DigestSchedule(this.container, this.redis.queueClient()).register();
    await new PartitionsSchedule(this.container, this.redis.queueClient()).register();
    await new CleanupSchedule(this.container, this.redis.queueClient()).register();
    await new RetentionSchedule(this.container, this.redis.queueClient()).register();
    await new OrphansSchedule(this.container, this.redis.queueClient()).register();
    await new SparesSchedule(this.container, this.redis.queueClient()).register();

    this.warnIfOversubscribed();

    this.container.logger.emit("process.started", {
      service: "worker",
      // Which lanes this process serves, so a specialised service is told apart from one
      // serving everything.
      consumers: this.supervisor.workers.length,
      queues: this.supervisor.workers.map((worker) => worker.name).join(","),
    });
  }

  // Off the lanes that actually started, never the consumers in the tree: a lane this
  // process does not serve holds no connection and must not be counted.
  private warnIfOversubscribed(): void {
    // Mail is left out: a send holds an SMTP socket, never a database connection, and
    // counting it made the defaults sum to the pool exactly.
    const concurrency = this.supervisor.workers
      .filter((worker) => worker.name !== QueueName.MAIL)
      .reduce((sum, worker) => sum + worker.concurrency, 0);
    const poolMax = Env.databasePoolMax;
    if (concurrency <= poolMax) return;

    // A warning, not a throw: a job that holds no connection is legitimate, and plenty
    // hold none. The operator wants this line before the queue stalls, not after.
    this.container.logger.emit("worker.pool.oversubscribed", { concurrency, poolMax });
  }

  // Idempotent, and a second signal *joins* the drain already running. Returning early
  // resolves at once, and `main.ts` exits on that — mid-close. See docs/reference/shutdown.md.
  public stop(signal: string): Promise<void> {
    this.draining ??= this.drain(signal);
    return this.draining;
  }

  private async drain(signal: string): Promise<void> {
    this.container.logger.emit("process.stopping", { service: "worker", signal });
    const startedAt = this.container.clock.now();
    this.stopping.abort();

    // Handled before the race, never after: once the timeout has won, a rejection arriving
    // late has nowhere to land but `unhandledRejection`, which exits 1 over a clean drain.
    const closed = this.supervisor.close().then(
      () => undefined,
      (error: unknown) => {
        this.container.logger.failure(error, { service: "worker", phase: "close" });
      },
    );

    // `close()` drains; the race is the backstop, because a job that never returns must
    // not hold the process past the platform's SIGKILL timer.
    await Promise.race([closed, WorkerBootstrap.after(Env.shutdownTimeoutMs)]);

    await this.redis.close();

    this.container.logger.emit("process.stopped", {
      service: "worker",
      durationMs: this.container.clock.now().getTime() - startedAt.getTime(),
    });

    // Last, because everything closing above it may have had something to say.
    await this.container.dispose();
  }

  private static after(ms: number): Promise<void> {
    return new Promise((resolve) => {
      // Unreferenced, so a pending timer cannot keep the loop alive once every worker
      // has drained.
      setTimeout(resolve, ms).unref();
    });
  }
}
