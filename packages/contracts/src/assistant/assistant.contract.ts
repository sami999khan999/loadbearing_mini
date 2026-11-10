import { z } from "../import.js";

// A question is a paragraph or two. The answer is what may be long, and its cap is the
// model's `ASSISTANT_MAX_OUTPUT_TOKENS`, not a schema bound.
const QUESTION_MAX = 4_000;
const TITLE_MAX = 120;
const PAGE_MAX = 50;
const CURSOR_MAX = 256;

const status = z.enum(["pending", "complete", "cancelled", "interrupted", "failed"]);

// A passage an answer was given, re-checked on every read: `available` is false once the
// reader may no longer open it, and the title is then the only thing shown.
const source = z.object({
  kind: z.enum(["doc", "document"]),
  id: z.string().min(1),
  title: z.string(),
  // A doc's `<space>/<path>`, which the client turns into a link. Null for a document.
  path: z.string().nullable(),
  available: z.boolean(),
});

const thread = z.object({
  id: z.uuid(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const message = z.object({
  id: z.uuid(),
  threadId: z.uuid(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status,
  sources: z.array(source).readonly(),
  model: z.string().nullable(),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
});

const usageTotal = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  answers: z.number().int().nonnegative(),
});

export class AssistantContract {
  private constructor() {}

  public static readonly status = status;
  public static readonly source = source;
  public static readonly thread = thread;
  public static readonly message = message;

  // Newest activity first. Its own query rather than `Keyset.query`, for a smaller page.
  public static readonly listQuery = z.object({
    limit: z.number().int().positive().max(PAGE_MAX).default(20),
    cursor: z.string().max(CURSOR_MAX).optional(),
  });

  public static readonly page = z.object({
    items: z.array(thread).readonly(),
    nextCursor: z.string().nullable(),
  });

  public static readonly get = z.object({ threadId: z.uuid() });

  // The thread and its latest messages, oldest first.
  public static readonly detail = z.object({
    thread,
    messages: z.array(message).readonly(),
  });

  // No `threadId` starts a new thread, titled from the question.
  public static readonly send = z.object({
    threadId: z.uuid().optional(),
    question: z.string().trim().min(1).max(QUESTION_MAX),
  });

  // The answer's id is what the client opens `realtime.assistant` with.
  public static readonly sent = z.object({
    threadId: z.uuid(),
    questionId: z.uuid(),
    messageId: z.uuid(),
  });

  public static readonly answer = z.object({
    threadId: z.uuid(),
    messageId: z.uuid(),
  });

  // The tenant's own spend, today and this month, UTC. A zero limit is no daily cap.
  public static readonly usage = z.object({
    today: usageTotal,
    month: usageTotal,
    dailyTokenLimit: z.number().int().nonnegative(),
  });

  public static readonly rename = z.object({
    threadId: z.uuid(),
    title: z.string().trim().min(1).max(TITLE_MAX),
  });

  // One answer as it streams. `text` frames append in order; `done` arrives once and
  // ends the stream with the settled status. Ids are the log's, so a resume names one.
  public static readonly frame = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), id: z.string(), text: z.string() }),
    z.object({
      kind: z.literal("done"),
      id: z.string(),
      status: status.exclude(["pending"]),
      sources: z.array(source).readonly(),
    }),
  ]);
}

export type AssistantStatus = z.infer<typeof AssistantContract.status>;
export type AssistantSourceDto = z.infer<typeof AssistantContract.source>;
export type AssistantThreadDto = z.infer<typeof AssistantContract.thread>;
export type AssistantMessageDto = z.infer<typeof AssistantContract.message>;
export type AssistantThreadPage = z.infer<typeof AssistantContract.page>;
export type AssistantThreadDetail = z.infer<typeof AssistantContract.detail>;
export type AssistantFrame = z.infer<typeof AssistantContract.frame>;
export type ListAssistantThreadsInput = z.infer<typeof AssistantContract.listQuery>;
export type GetAssistantThreadInput = z.infer<typeof AssistantContract.get>;
export type SendAssistantQuestionInput = z.infer<typeof AssistantContract.send>;
export type AssistantSent = z.infer<typeof AssistantContract.sent>;
export type AssistantAnswerInput = z.infer<typeof AssistantContract.answer>;
export type RenameAssistantThreadInput = z.infer<typeof AssistantContract.rename>;
export type AssistantUsageDto = z.infer<typeof AssistantContract.usage>;
