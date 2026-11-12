import type { AssistantFrame } from "@loadbearing/contracts";
import {
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@loadbearing/errors";
import { describe, expect, it } from "vitest";
import { AssistantBudget } from "../../src/assistant/assistant-budget.rules.js";
import type { AssistantRetrieval } from "../../src/assistant/assistant-retrieval.js";
import type { AssistantStreamSubscriber } from "../../src/assistant/assistant-stream.subscriber.js";
import { CancelAssistantAnswerUseCase } from "../../src/assistant/cancel-assistant-answer.use-case.js";
import { DeleteAssistantThreadUseCase } from "../../src/assistant/delete-assistant-thread.use-case.js";
import { FailStaleAssistantAnswersUseCase } from "../../src/assistant/fail-stale-assistant-answers.use-case.js";
import { GetAssistantThreadUseCase } from "../../src/assistant/get-assistant-thread.use-case.js";
import { ListAssistantThreadsUseCase } from "../../src/assistant/list-assistant-threads.use-case.js";
import { RenameAssistantThreadUseCase } from "../../src/assistant/rename-assistant-thread.use-case.js";
import { SendAssistantQuestionUseCase } from "../../src/assistant/send-assistant-question.use-case.js";
import { StreamAssistantAnswerUseCase } from "../../src/assistant/stream-assistant-answer.use-case.js";
import type { RealtimePublisher } from "../../src/port/index.js";
import { QueueName, RealtimeChannels } from "../../src/primitive/index.js";
import {
  Activity,
  ANSWER,
  authorizer,
  Budget,
  clock,
  Direct,
  GRACE,
  Messages,
  NOW,
  principal,
  QUESTION,
  Queue,
  Stream,
  THREAD,
  Threads,
  thread,
  turn,
} from "./assistant-harness.js";

const pending = () =>
  turn({ id: ANSWER, role: "assistant", content: "", status: "pending", completedAt: null });

const send = (
  options: { enabled?: boolean; activePerUser?: number; dailyTokens?: number } = {},
  ...seed: ReturnType<typeof turn>[]
) => {
  const threads = new Threads(thread());
  const messages = new Messages(...seed);
  const queue = new Queue();
  const activity = new Activity();
  const budget = new Budget();
  const useCase = new SendAssistantQuestionUseCase(
    authorizer,
    threads,
    messages,
    new AssistantBudget(budget, clock(), options.dailyTokens ?? 0),
    queue,
    activity,
    new Direct(),
    clock(),
    { activePerUser: options.activePerUser ?? 2, enabled: options.enabled ?? true },
  );
  return { useCase, threads, messages, queue, activity, budget };
};

describe("SendAssistantQuestionUseCase", () => {
  it("starts a thread titled from the question, writes both rows and queues one attempt", async () => {
    const harness = send();
    const sent = await harness.useCase.execute(principal(), { question: "How do keys rotate?" });

    expect(harness.threads.rows.get(sent.threadId)?.title).toBe("How do keys rotate?");
    expect(harness.messages.rows.map((row) => [row.role, row.status])).toEqual([
      ["user", "complete"],
      ["assistant", "pending"],
    ]);
    expect(harness.activity.actions).toEqual(["ai.assistant.thread.created"]);
    expect(harness.queue.jobs).toEqual([
      {
        queue: QueueName.ASSISTANT,
        payload: expect.objectContaining({ messageId: sent.messageId, threadId: sent.threadId }),
        options: { inFlightId: sent.messageId, attempts: 1 },
      },
    ]);
  });

  it("adds to an existing thread without a second audit row", async () => {
    const harness = send();
    const sent = await harness.useCase.execute(principal(), { threadId: THREAD, question: "And?" });
    expect(sent.threadId).toBe(THREAD);
    expect(harness.threads.touched).toBe(1);
    expect(harness.activity.actions).toEqual([]);
  });

  it("answers NOT_FOUND for someone else's thread, the same as for a missing one", async () => {
    const harness = send();
    await expect(
      harness.useCase.execute(principal(GRACE), { threadId: THREAD, question: "Mine?" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(harness.queue.jobs).toEqual([]);
  });

  it("refuses past the active-generation cap, but not for an answer stuck past the window", async () => {
    const running = send({ activePerUser: 1 }, pending());
    await expect(
      running.useCase.execute(principal(), { question: "Again?" }),
    ).rejects.toBeInstanceOf(RateLimitedError);

    const stuck = send(
      { activePerUser: 1 },
      {
        ...pending(),
        createdAt: new Date(NOW.getTime() - SendAssistantQuestionUseCase.STALE_MS - 1),
      },
    );
    await expect(stuck.useCase.execute(principal(), { question: "Again?" })).resolves.toBeDefined();
  });

  it("refuses once the organization's tokens for the day are spent", async () => {
    const harness = send({ dailyTokens: 10 });
    await harness.budget.add(principal().organizationId, "", 10);
    await expect(harness.useCase.execute(principal(), { question: "Q" })).rejects.toBeInstanceOf(
      RateLimitedError,
    );
  });

  it("is NOT_FOUND when the deployment runs no model, and FORBIDDEN without the key", async () => {
    await expect(
      send({ enabled: false }).useCase.execute(principal(), { question: "Q" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      send().useCase.execute(principal(undefined, ["doc.page.read"]), { question: "Q" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ListAssistantThreadsUseCase", () => {
  it("pages the author's threads newest first and refuses a cursor it did not hand out", async () => {
    const threads = new Threads(
      thread({ id: "018f8c00-0000-7000-8000-0000000000a1", updatedAt: new Date(1_000) }),
      thread({ id: "018f8c00-0000-7000-8000-0000000000a2", updatedAt: new Date(2_000) }),
      thread({ id: "018f8c00-0000-7000-8000-0000000000a3", authorId: GRACE }),
    );
    const list = new ListAssistantThreadsUseCase(authorizer, threads);

    const first = await list.execute(principal(), { limit: 1 });
    expect(first.items.map((item) => item.id)).toEqual(["018f8c00-0000-7000-8000-0000000000a2"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await list.execute(principal(), { limit: 1, cursor: first.nextCursor ?? "" });
    expect(second.items.map((item) => item.id)).toEqual(["018f8c00-0000-7000-8000-0000000000a1"]);
    expect(second.nextCursor).toBeNull();

    await expect(
      list.execute(principal(), { limit: 1, cursor: "nonsense" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("GetAssistantThreadUseCase", () => {
  it("re-checks each saved source, in order, as the reader may see it now", async () => {
    const sources = [
      { kind: "doc" as const, id: "a", title: "Kept", path: "ops/a" },
      { kind: "doc" as const, id: "b", title: "Lost", path: "secret/b" },
    ];
    const messages = new Messages(
      turn(),
      turn({ id: ANSWER, role: "assistant", content: "x", sources }),
    );
    const retrieval = {
      available: (_viewer: unknown, list: readonly { path: string | null }[]) =>
        Promise.resolve(list.map((source) => source.path?.startsWith("ops/") ?? false)),
    } as unknown as AssistantRetrieval;
    const get = new GetAssistantThreadUseCase(
      authorizer,
      new Threads(thread()),
      messages,
      retrieval,
    );

    const detail = await get.execute(principal(), { threadId: THREAD });
    expect(detail.messages[1]?.sources.map((source) => source.available)).toEqual([true, false]);
    await expect(get.execute(principal(GRACE), { threadId: THREAD })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("CancelAssistantAnswerUseCase", () => {
  it("flags a pending answer and leaves a settled one alone", async () => {
    const stream = new Stream();
    const messages = new Messages(turn(), pending());
    const cancel = new CancelAssistantAnswerUseCase(
      authorizer,
      new Threads(thread()),
      messages,
      stream as never,
    );

    await cancel.execute(principal(), { threadId: THREAD, messageId: ANSWER });
    expect(stream.cancelled.has(ANSWER)).toBe(true);

    // The question is not an answer, and asking to stop it is NOT_FOUND.
    await expect(
      cancel.execute(principal(), { threadId: THREAD, messageId: QUESTION }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("RenameAssistantThreadUseCase and DeleteAssistantThreadUseCase", () => {
  it("renames without moving the thread in the list, and deletes with its messages", async () => {
    const threads = new Threads(thread());
    const messages = new Messages(turn(), pending());
    const activity = new Activity();

    // Found walking two tabs: a rename or delete reached neither the list nor the thread
    // in the other tab, because only a settled answer said `assistant.changed`.
    const sent: { channel: string; name: string; threadId: unknown }[] = [];
    const realtime = {
      publish: (channel: string, frame: { name: string; payload: { threadId?: unknown } }) => {
        sent.push({ channel, name: frame.name, threadId: frame.payload.threadId });
        return Promise.resolve();
      },
    } as unknown as RealtimePublisher;

    const renamed = await new RenameAssistantThreadUseCase(
      authorizer,
      threads,
      realtime,
      clock(),
    ).execute(principal(), { threadId: THREAD, title: "Rotation" });
    expect(renamed).toMatchObject({ title: "Rotation", updatedAt: NOW });

    await new DeleteAssistantThreadUseCase(
      authorizer,
      threads,
      messages,
      activity,
      new Direct(),
      realtime,
      clock(),
    ).execute(principal(), { threadId: THREAD });
    expect(threads.rows.size).toBe(0);
    expect(messages.rows).toEqual([]);
    expect(activity.actions).toEqual(["ai.assistant.thread.deleted"]);
    const channel = RealtimeChannels.user(principal().organizationId, principal().userId);
    expect(sent).toEqual([
      { channel, name: "assistant.changed", threadId: THREAD },
      { channel, name: "assistant.changed", threadId: THREAD },
    ]);
  });
});

describe("StreamAssistantAnswerUseCase", () => {
  const collect = async (stream: AsyncIterable<AssistantFrame>) => {
    const out: AssistantFrame[] = [];
    for await (const frame of stream) out.push(frame);
    return out;
  };

  const build = (answer = pending()) => {
    const opened: (string | undefined)[] = [];
    const subscriber = {
      async *subscribe(_messageId: string, _signal: unknown, after?: string) {
        opened.push(after);
        yield { kind: "text" as const, id: "1-1", text: "live" };
      },
    } as unknown as AssistantStreamSubscriber;
    const retrieval = {
      available: (_viewer: unknown, list: readonly unknown[]) =>
        Promise.resolve(list.map(() => false)),
    } as unknown as AssistantRetrieval;
    const stream = new StreamAssistantAnswerUseCase(
      authorizer,
      new Threads(thread()),
      new Messages(turn(), answer),
      retrieval,
      subscriber,
    );
    return { stream, opened };
  };

  it("follows a pending answer's log from the resume point", async () => {
    const { stream, opened } = build();
    const out = await collect(
      stream.execute(
        principal(),
        { threadId: THREAD, messageId: ANSWER },
        new AbortController().signal,
        "1-0",
      ),
    );
    expect(out.map((frame) => frame.kind)).toEqual(["text"]);
    expect(opened).toEqual(["1-0"]);
  });

  it("answers a settled one with a single done, its sources re-checked, and opens no log", async () => {
    const { stream, opened } = build({
      ...pending(),
      status: "complete",
      sources: [{ kind: "doc", id: "a", title: "A", path: "x/a" }],
    });
    const out = await collect(
      stream.execute(
        principal(),
        { threadId: THREAD, messageId: ANSWER },
        new AbortController().signal,
      ),
    );
    expect(out).toEqual([
      {
        kind: "done",
        id: "settled",
        status: "complete",
        sources: [{ kind: "doc", id: "a", title: "A", path: "x/a", available: false }],
      },
    ]);
    expect(opened).toEqual([]);
  });

  it("opens nobody else's answer", async () => {
    const { stream, opened } = build();
    await expect(
      collect(
        stream.execute(
          principal(GRACE),
          { threadId: THREAD, messageId: ANSWER },
          new AbortController().signal,
        ),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(opened).toEqual([]);
  });
});

describe("FailStaleAssistantAnswersUseCase", () => {
  it("fails what is stuck past the window, in batches, and leaves what is running", async () => {
    const old = new Date(NOW.getTime() - SendAssistantQuestionUseCase.STALE_MS - 1);
    const messages = new Messages(
      { ...pending(), id: "stuck-1", createdAt: old },
      { ...pending(), id: "stuck-2", createdAt: old },
      pending(),
    );
    const failed = await new FailStaleAssistantAnswersUseCase(messages, clock()).execute(
      principal(),
    );
    expect(failed).toBe(2);
    expect(messages.rows.map((row) => row.status)).toEqual(["failed", "failed", "pending"]);
  });
});
