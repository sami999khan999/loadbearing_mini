import { describe, expect, it } from "vitest";
import type { AssistantFrame, Redis } from "../../src/import.js";
import { AssistantLog } from "../../src/redis/assistant-log.js";
import { RedisAssistantStreamPublisher } from "../../src/redis/redis-assistant-stream.publisher.js";
import { RedisAssistantStreamSubscriber } from "../../src/redis/redis-assistant-stream.subscriber.js";

const MESSAGE = "00000000-0000-7000-8000-0000000000a1";
const CHANNEL = AssistantLog.channelOf(MESSAGE);

// Enough of ioredis for both halves: an answer's log, its channel, and the stop flag. The
// script is run as its three commands, which is what `APPEND` sends in one round trip.
class FakeRedis {
  public readonly ranges: string[] = [];
  public readonly subscribed: string[] = [];
  public readonly unsubscribed: string[] = [];
  public readonly flags = new Map<string, string>();
  private readonly entries: [string, string][] = [];
  private handler: ((channel: string, payload: string) => void) | null = null;
  private sequence = 0;

  public eval(
    _script: string,
    _keys: number,
    _key: string,
    body: string,
    _ttl: number,
    channel: string,
  ) {
    this.sequence += 1;
    const id = `1000-${this.sequence}`;
    this.entries.push([id, body]);
    this.handler?.(channel, `${id}|${body}`);
    return Promise.resolve(id);
  }

  public xrange(_key: string, start: string, _end: string) {
    this.ranges.push(start);
    const after = start.startsWith("(") ? start.slice(1) : null;
    return Promise.resolve(
      this.entries
        .filter(([id]) => after === null || AssistantLog.isAfter(id, after))
        .map(([id, body]) => [id, ["f", body]] as const),
    );
  }

  public subscribe(channel: string) {
    this.subscribed.push(channel);
    return Promise.resolve(1);
  }

  public unsubscribe(channel: string) {
    this.unsubscribed.push(channel);
    return Promise.resolve(0);
  }

  public on(_event: "message", handler: (channel: string, payload: string) => void): this {
    this.handler = handler;
    return this;
  }

  // A frame heard live a second time, as one published between the attach and the read is.
  public redeliver(id: string): void {
    const entry = this.entries.find(([each]) => each === id);
    if (entry) this.handler?.(CHANNEL, `${entry[0]}|${entry[1]}`);
  }

  public set(key: string, value: string) {
    this.flags.set(key, value);
    return Promise.resolve("OK");
  }

  public exists(key: string) {
    return Promise.resolve(this.flags.has(key) ? 1 : 0);
  }
}

const build = (maxAgeMs = 60_000) => {
  const redis = new FakeRedis();
  const client = () => redis as unknown as Redis;
  return {
    redis,
    publisher: new RedisAssistantStreamPublisher(client()),
    subscriber: new RedisAssistantStreamSubscriber(client, client, { maxAgeMs }),
  };
};

const signal = () => new AbortController().signal;

const collect = async (stream: AsyncIterable<AssistantFrame>) => {
  const frames: AssistantFrame[] = [];
  for await (const frame of stream) frames.push(frame);
  return frames;
};

describe("RedisAssistantStreamSubscriber", () => {
  it("replays the whole log on a first open, then follows it live until done", async () => {
    const { redis, publisher, subscriber } = build();
    await publisher.publish(MESSAGE, { kind: "text", text: "Rotate " });

    const reading = collect(subscriber.subscribe(MESSAGE, signal()));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await publisher.publish(MESSAGE, { kind: "text", text: "quarterly." });
    await publisher.publish(MESSAGE, { kind: "done", status: "complete", sources: [] });

    const frames = await reading;
    expect(frames.map((frame) => frame.kind)).toEqual(["text", "text", "done"]);
    expect(frames.map((frame) => frame.id)).toEqual(["1000-1", "1000-2", "1000-3"]);
    expect(redis.ranges).toEqual(["-"]);
    // The last reader off the answer releases its channel.
    expect(redis.unsubscribed).toEqual([CHANNEL]);
  });

  it("reads only what came after the resume point, never the whole log", async () => {
    const { redis, publisher, subscriber } = build();
    await publisher.publish(MESSAGE, { kind: "text", text: "one" });
    await publisher.publish(MESSAGE, { kind: "text", text: "two" });
    await publisher.publish(MESSAGE, { kind: "done", status: "complete", sources: [] });

    const frames = await collect(subscriber.subscribe(MESSAGE, signal(), "1000-1"));
    expect(redis.ranges).toEqual(["(1000-1"]);
    expect(frames.map((frame) => frame.id)).toEqual(["1000-2", "1000-3"]);
  });

  it("reads a resume point that names no stream entry as a first open", async () => {
    const { redis, publisher, subscriber } = build();
    await publisher.publish(MESSAGE, { kind: "done", status: "complete", sources: [] });
    await collect(subscriber.subscribe(MESSAGE, signal(), "settled"));
    expect(redis.ranges).toEqual(["-"]);
  });

  it("yields a frame both read from the log and heard live once", async () => {
    const { redis, publisher, subscriber } = build();
    await publisher.publish(MESSAGE, { kind: "text", text: "one" });

    const reading = collect(subscriber.subscribe(MESSAGE, signal()));
    await new Promise((resolve) => setTimeout(resolve, 5));
    redis.redeliver("1000-1");
    await publisher.publish(MESSAGE, { kind: "done", status: "cancelled", sources: [] });

    expect((await reading).map((frame) => frame.id)).toEqual(["1000-1", "1000-2"]);
  });

  it("ends an answer that stops arriving once its age runs out", async () => {
    const { publisher, subscriber } = build(20);
    await publisher.publish(MESSAGE, { kind: "text", text: "half" });
    const frames = await collect(subscriber.subscribe(MESSAGE, signal()));
    expect(frames.map((frame) => frame.kind)).toEqual(["text"]);
  });
});

describe("RedisAssistantStreamPublisher", () => {
  it("sets the stop flag where the worker reads it", async () => {
    const { publisher } = build();
    expect(await publisher.isCancelRequested(MESSAGE)).toBe(false);
    await publisher.requestCancel(MESSAGE);
    expect(await publisher.isCancelRequested(MESSAGE)).toBe(true);
  });
});

describe("AssistantLog", () => {
  it("orders stream ids by number, not by string", () => {
    expect(AssistantLog.isAfter("10000-0", "9999-5")).toBe(true);
    expect(AssistantLog.isAfter("1000-2", "1000-10")).toBe(false);
    expect(AssistantLog.isAfter("1000-1", "1000-1")).toBe(false);
  });
});
