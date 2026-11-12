import type { UserId } from "@loadbearing/contracts";
import { UnavailableError } from "@loadbearing/errors";
import { describe, expect, it } from "vitest";
import { AssistantBudget } from "../../src/assistant/assistant-budget.rules.js";
import type {
  AssistantRetrieval,
  AssistantRetrieved,
} from "../../src/assistant/assistant-retrieval.js";
import { GenerateAssistantAnswerUseCase } from "../../src/assistant/generate-assistant-answer.use-case.js";
import type { TenantMembershipReader } from "../../src/port/index.js";
import type { CapabilityRepository } from "../../src/rbac/index.js";
import {
  ADA,
  ANSWER,
  Budget,
  caps,
  clock,
  Direct,
  Messages,
  Model,
  NOW,
  ORG,
  principal,
  Realtime,
  Stream,
  THREAD,
  Threads,
  thread,
  turn,
  Usage,
} from "./assistant-harness.js";

const JOB = { organizationId: ORG, threadId: THREAD, messageId: ANSWER, authorId: ADA };

const found: AssistantRetrieved = {
  passages: [{ title: "Keys", text: "Keys rotate every quarter." }],
  sources: [{ kind: "doc", id: "page-1", title: "Keys", path: "ops/keys" }],
};

const build = (
  model: Model,
  options: {
    readonly member?: boolean;
    readonly keys?: Parameters<typeof caps>[0];
    readonly retrieved?: AssistantRetrieved;
  } = {},
) => {
  const time = clock();
  const messages = new Messages(
    turn(),
    turn({
      id: ANSWER,
      role: "assistant",
      content: "",
      status: "pending",
      createdAt: new Date(NOW.getTime() + 1),
      completedAt: null,
    }),
  );
  const threads = new Threads(thread());
  const usage = new Usage();
  const stream = new Stream();
  const realtime = new Realtime();
  const budget = new Budget();
  const asked: string[] = [];
  const members: TenantMembershipReader = {
    isActiveMember: () => Promise.resolve(options.member ?? true),
    activeMemberIds: () => Promise.resolve(new Set<UserId>()),
  };
  const capabilities = {
    resolveFor: () => Promise.resolve(caps(options.keys ?? ["ai.assistant.use", "doc.page.read"])),
  } as unknown as CapabilityRepository;
  const retrieval = {
    find: (asker: { userId: string }, question: string) => {
      asked.push(`${asker.userId}:${question}`);
      return Promise.resolve(options.retrieved ?? found);
    },
  } as unknown as AssistantRetrieval;

  const useCase = new GenerateAssistantAnswerUseCase(
    threads,
    messages,
    usage,
    members,
    capabilities,
    retrieval,
    model,
    stream as never,
    realtime,
    new AssistantBudget(budget, time, 0),
    new Direct(),
    time,
    256,
  );
  const answer = () => messages.rows.find((row) => row.id === ANSWER);
  return { useCase, messages, threads, usage, stream, realtime, budget, asked, time, answer };
};

const system = principal();

describe("GenerateAssistantAnswerUseCase", () => {
  it("answers as the asker, streams the text, and settles once with usage and sources", async () => {
    const model = new Model(["Every ", "quarter."], {
      usage: { inputTokens: 120, outputTokens: 4 },
    });
    const harness = build(model);

    expect(await harness.useCase.execute(system, JOB)).toBe("complete");

    expect(harness.asked).toEqual([`${ADA}:How often are keys rotated?`]);
    expect(harness.stream.text()).toBe("Every quarter.");
    expect(harness.stream.frames.at(-1)).toMatchObject({ kind: "done", status: "complete" });
    expect(harness.answer()).toMatchObject({
      status: "complete",
      content: "Every quarter.",
      model: "scripted",
      sources: found.sources,
    });
    expect(harness.usage.rows).toHaveLength(1);
    expect(harness.usage.rows[0]).toMatchObject({ inputTokens: 120, outputTokens: 4 });
    expect(harness.budget.total).toBe(124);
    // One invalidation, to the author's own channel, so their other tabs refetch the list.
    expect(harness.realtime.sent.map((frame) => frame.kind === "event" && frame.name)).toEqual([
      "assistant.changed",
    ]);
  });

  it("fences the passages into the prompt and keeps the question last", async () => {
    const model = new Model(["ok"]);
    await build(model).useCase.execute(system, JOB);

    const last = model.requests[0]?.messages.at(-1)?.content ?? "";
    expect(last).toContain('<passage title="Keys">');
    expect(last.endsWith("Question: How often are keys rotated?")).toBe(true);
  });

  it("does nothing for an answer already settled, so a duplicate job bills nobody", async () => {
    const model = new Model(["first"]);
    const harness = build(model);
    await harness.useCase.execute(system, JOB);

    expect(await harness.useCase.execute(system, JOB)).toBeNull();
    expect(model.requests).toHaveLength(1);
    expect(harness.usage.rows).toHaveLength(1);
  });

  it("fails without calling the model when the asker left the organization after asking", async () => {
    const model = new Model(["never"]);
    const harness = build(model, { member: false });

    expect(await harness.useCase.execute(system, JOB)).toBe("failed");
    expect(model.requests).toHaveLength(0);
    expect(harness.asked).toEqual([]);
    expect(harness.usage.rows).toHaveLength(0);
    expect(harness.stream.frames).toEqual([{ kind: "done", status: "failed", sources: [] }]);
  });

  it("fails without calling the model when the asker lost the assistant since asking", async () => {
    const model = new Model(["never"]);
    expect(await build(model, { keys: ["doc.page.read"] }).useCase.execute(system, JOB)).toBe(
      "failed",
    );
    expect(model.requests).toHaveLength(0);
  });

  it("stops at the next check once a stop is requested, and keeps what had streamed", async () => {
    let harness: ReturnType<typeof build> | undefined;
    const model = new Model(["one ", "two ", "three"], {
      onPart: (index) => {
        if (!harness) return;
        harness.time.advance(600);
        if (index === 1) harness.stream.cancelled.add(ANSWER);
      },
    });
    harness = build(model);

    expect(await harness.useCase.execute(system, JOB)).toBe("cancelled");
    expect(harness.answer()).toMatchObject({ status: "cancelled", content: "one two " });
    expect(harness.stream.text()).toBe("one two ");
  });

  it("saves an answer cut off by a drain as interrupted", async () => {
    const drain = new AbortController();
    const model = new Model(["half "], {
      onPart: () => drain.abort(),
      fail: new UnavailableError("assistant.stream"),
    });
    const harness = build(model);

    expect(await harness.useCase.execute(system, JOB, drain.signal)).toBe("interrupted");
    expect(harness.answer()).toMatchObject({ status: "interrupted", content: "half " });
  });

  it("saves a provider outage as failed and keeps the partial text", async () => {
    const model = new Model(["partial"], { fail: new UnavailableError("assistant.stream") });
    const harness = build(model);

    expect(await harness.useCase.execute(system, JOB)).toBe("failed");
    expect(harness.answer()).toMatchObject({ status: "failed", content: "partial" });
    expect(harness.stream.frames.at(-1)).toMatchObject({ kind: "done", status: "failed" });
  });

  it("settles a defect as failed before it rethrows, so nobody waits on it", async () => {
    const defect = new TypeError("bug");
    const harness = build(new Model([], { fail: defect }));

    await expect(harness.useCase.execute(system, JOB)).rejects.toBe(defect);
    expect(harness.answer()?.status).toBe("failed");
    expect(harness.stream.frames.at(-1)).toMatchObject({ kind: "done", status: "failed" });
  });

  it("estimates the tokens when the provider reports none", async () => {
    const harness = build(new Model(["a".repeat(40)]));
    await harness.useCase.execute(system, JOB);
    expect(harness.usage.rows[0]?.outputTokens).toBe(10);
    expect(harness.usage.rows[0]?.inputTokens).toBeGreaterThan(0);
  });
});
