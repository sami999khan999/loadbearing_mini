import {
  type AssistantFrame,
  AssistantStreamSubscriber,
  type CancellationSignal,
  type Redis,
} from "../import.js";
import { AssistantLog } from "./assistant-log.js";

export interface RedisAssistantStreamConfig {
  // The longest a reader waits on an answer that has stopped arriving: a worker that died
  // mid-stream sends no `done`, and the reader must not be held for the process's life.
  readonly maxAgeMs: number;
}

type Sink = (frame: AssistantFrame) => void;

// One subscriber connection per process, demultiplexed by channel, shared with realtime's
// when the instance is one. Nothing is dropped: an answer's frames are bounded by its cap.
export class RedisAssistantStreamSubscriber extends AssistantStreamSubscriber {
  private readonly sinks = new Map<string, Set<Sink>>();
  private listening = false;

  // Factories, not clients, so a process that never streams an answer never dials either.
  public constructor(
    private readonly connection: () => Redis,
    private readonly log: () => Redis,
    private readonly config: RedisAssistantStreamConfig,
  ) {
    super();
  }

  public override async *subscribe(
    messageId: string,
    signal: CancellationSignal,
    after?: string,
  ): AsyncIterable<AssistantFrame> {
    const channel = AssistantLog.channelOf(messageId);
    const queue: AssistantFrame[] = [];
    let wake: (() => void) | null = null;
    const push: Sink = (frame) => {
      queue.push(frame);
      wake?.();
      wake = null;
    };
    const onAbort = () => {
      wake?.();
      wake = null;
    };
    const deadline = Date.now() + this.config.maxAgeMs;
    signal.addEventListener("abort", onAbort);

    try {
      // Attached before the log is read, so nothing published in between is missed. What is
      // both read and heard is dropped below by its id, which only ever moves forward.
      await this.attach(channel, push);
      const missed = await AssistantLog.since(this.log(), messageId, after);
      queue.unshift(...missed);

      let last = after;
      while (!signal.aborted && Date.now() < deadline) {
        const next = queue.shift();
        if (!next) {
          await this.park(deadline, (resolve) => {
            wake = resolve;
          });
          continue;
        }
        if (last !== undefined && !AssistantLog.isAfter(next.id, last)) continue;
        last = next.id;
        yield next;
        if (next.kind === "done") return;
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
      await this.detach(channel, push);
    }
  }

  private park(deadline: number, register: (resolve: () => void) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
      register(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private async attach(channel: string, sink: Sink): Promise<void> {
    this.listen();
    const existing = this.sinks.get(channel);
    if (existing) {
      existing.add(sink);
      return;
    }
    this.sinks.set(channel, new Set([sink]));
    await this.connection().subscribe(channel);
  }

  // Ref-counted, as realtime's is: the last reader off a channel releases it.
  private async detach(channel: string, sink: Sink): Promise<void> {
    const existing = this.sinks.get(channel);
    if (!existing) return;
    existing.delete(sink);
    if (existing.size > 0) return;
    this.sinks.delete(channel);
    await Promise.resolve()
      .then(() => this.connection().unsubscribe(channel))
      .catch(() => undefined);
  }

  // A second listener on a connection realtime may also hold: each reads only its own
  // channels, and an answer's channel never matches a realtime one.
  private listen(): void {
    if (this.listening) return;
    this.listening = true;

    this.connection().on("message", (channel: string, payload: string) => {
      const sinks = this.sinks.get(channel);
      if (!sinks || sinks.size === 0) return;
      const at = payload.indexOf("|");
      const frame =
        at === -1 ? null : AssistantLog.parse(payload.slice(0, at), payload.slice(at + 1));
      if (!frame) return;
      for (const sink of sinks) sink(frame);
    });
  }
}
