import type { Container } from "@loadbearing/composition";
import type { Job } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { AssistantConsumer } from "../../src/consumer/assistant.consumer.js";

const ORG = "018f8c00-0000-7000-8000-000000000010";
const JOB = { organizationId: ORG, threadId: "t", messageId: "m", authorId: "u" };

const harness = (withModel = true) => {
  const placedFor: string[] = [];
  const signals: AbortSignal[] = [];
  const generate = {
    execute: vi.fn(async (_system: unknown, _job: unknown, signal: AbortSignal) => {
      signals.push(signal);
      return "complete";
    }),
  };
  const draining = new AbortController();
  const container = {
    placed: (principal: { organizationId: string }, work: () => Promise<unknown>) => {
      placedFor.push(principal.organizationId);
      return work();
    },
    assistant: { generate: withModel ? generate : null },
  } as unknown as Container;
  const consumer = new AssistantConsumer(container, {} as never, 1, 60, draining.signal);
  return { consumer, generate, placedFor, signals, draining };
};

describe("AssistantConsumer", () => {
  it("generates on the asker's tenant's node, as the job names it", async () => {
    const { consumer, generate, placedFor } = harness();
    await consumer.handle({ data: JOB } as Job);

    expect(placedFor).toEqual([ORG]);
    expect(generate.execute.mock.calls[0]?.[1]).toEqual(JOB);
  });

  // A drain aborts the answer, and so does BullMQ cancelling the job; either is enough.
  it("stops the answer when the process drains, as well as when the job is cancelled", async () => {
    const { consumer, signals, draining } = harness();
    const job = new AbortController();
    await consumer.handle({ data: JOB } as Job, job.signal);

    expect(signals[0]?.aborted).toBe(false);
    draining.abort();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("throws on a worker built without a model rather than dropping the job", async () => {
    await expect(harness(false).consumer.handle({ data: JOB } as Job)).rejects.toThrow(
      "without an assistant model",
    );
  });
});
