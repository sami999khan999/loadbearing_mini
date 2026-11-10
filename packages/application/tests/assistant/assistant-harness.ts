import type {
  AssistantFrame,
  OrganizationId,
  RealtimeMessage,
  UserId,
} from "@loadbearing/contracts";
import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import type { AssistantBudgetStore } from "../../src/assistant/assistant-budget.store.js";
import type {
  AssistantMessageRecord,
  AssistantMessageRepository,
  AssistantSettlement,
} from "../../src/assistant/assistant-message.repository.js";
import type { AssistantFrameBody } from "../../src/assistant/assistant-stream.publisher.js";
import type {
  AssistantThreadCursor,
  AssistantThreadRecord,
  AssistantThreadRepository,
} from "../../src/assistant/assistant-thread.repository.js";
import type {
  AssistantUsageRecord,
  AssistantUsageRepository,
} from "../../src/assistant/assistant-usage.repository.js";
import type {
  ActivityLogger,
  AssistantDelta,
  AssistantModel,
  AssistantRequest,
  QueuePublisher,
  RealtimePublisher,
  UnitOfWork,
} from "../../src/port/index.js";
import { Authorizer, Principal } from "../../src/primitive/index.js";

export const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
export const ADA = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
export const GRACE = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000012");
export const THREAD = "018f8c00-0000-7000-8000-0000000000a1";
export const QUESTION = "018f8c00-0000-7000-8000-0000000000b1";
export const ANSWER = "018f8c00-0000-7000-8000-0000000000b2";
export const NOW = new Date("2026-10-18T12:00:00Z");

export const authorizer = new Authorizer();

export const caps = (keys: readonly PermissionKey[]): CapabilitySet =>
  CapabilitySet.from({ wildcard: false, org: { grants: [...keys], denies: [] }, goals: {} });

export const principal = (
  userId: UserId = ADA,
  keys: readonly PermissionKey[] = ["ai.assistant.use", "doc.page.read", "ai.embedding.read"],
): Principal => new Principal(ORG, userId, caps(keys));

export const clock = (at: Date = NOW) => {
  let now = at.getTime();
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
};

export const thread = (over: Partial<AssistantThreadRecord> = {}): AssistantThreadRecord => ({
  id: THREAD,
  organizationId: ORG,
  authorId: ADA,
  title: "Keys",
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

export const turn = (over: Partial<AssistantMessageRecord> = {}): AssistantMessageRecord => ({
  id: QUESTION,
  organizationId: ORG,
  threadId: THREAD,
  authorId: ADA,
  role: "user",
  content: "How often are keys rotated?",
  status: "complete",
  sources: [],
  model: null,
  createdAt: NOW,
  completedAt: NOW,
  ...over,
});

export class Threads implements AssistantThreadRepository {
  public readonly rows = new Map<string, AssistantThreadRecord>();
  public touched = 0;

  public constructor(...seed: AssistantThreadRecord[]) {
    for (const row of seed) this.rows.set(row.id, row);
  }

  public findById(organizationId: OrganizationId, authorId: UserId, threadId: string) {
    const row = this.rows.get(threadId);
    return Promise.resolve(
      row && row.organizationId === organizationId && row.authorId === authorId ? row : null,
    );
  }

  public listByAuthor(
    _organizationId: OrganizationId,
    authorId: UserId,
    limit: number,
    before: AssistantThreadCursor | null,
  ) {
    const rows = [...this.rows.values()]
      .filter((row) => row.authorId === authorId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id))
      .filter(
        (row) =>
          !before ||
          row.updatedAt < before.updatedAt ||
          (row.updatedAt.getTime() === before.updatedAt.getTime() && row.id < before.id),
      );
    return Promise.resolve(rows.slice(0, limit));
  }

  public save(row: AssistantThreadRecord) {
    this.rows.set(row.id, row);
    return Promise.resolve();
  }

  public touch(_organizationId: OrganizationId, threadId: string, updatedAt: Date) {
    this.touched += 1;
    const row = this.rows.get(threadId);
    if (row) this.rows.set(threadId, { ...row, updatedAt });
    return Promise.resolve();
  }

  public delete(_organizationId: OrganizationId, threadId: string) {
    this.rows.delete(threadId);
    return Promise.resolve();
  }
}

export class Messages implements AssistantMessageRepository {
  public readonly rows: AssistantMessageRecord[] = [];

  public constructor(...seed: AssistantMessageRecord[]) {
    this.rows.push(...seed);
  }

  public listByThread(_organizationId: OrganizationId, threadId: string, limit: number) {
    return Promise.resolve(this.rows.filter((row) => row.threadId === threadId).slice(-limit));
  }

  public findInThread(_organizationId: OrganizationId, threadId: string, messageId: string) {
    return Promise.resolve(
      this.rows.find((row) => row.threadId === threadId && row.id === messageId) ?? null,
    );
  }

  public insert(row: AssistantMessageRecord) {
    this.rows.push(row);
    return Promise.resolve();
  }

  public settle(
    _organizationId: OrganizationId,
    _threadId: string,
    messageId: string,
    settlement: AssistantSettlement,
  ) {
    const at = this.rows.findIndex((row) => row.id === messageId && row.status === "pending");
    const row = this.rows[at];
    if (!row) return Promise.resolve(false);
    this.rows[at] = { ...row, ...settlement };
    return Promise.resolve(true);
  }

  public deleteByThread(_organizationId: OrganizationId, threadId: string) {
    for (let at = this.rows.length - 1; at >= 0; at -= 1) {
      if (this.rows[at]?.threadId === threadId) this.rows.splice(at, 1);
    }
    return Promise.resolve();
  }

  public countPending(_organizationId: OrganizationId, authorId: UserId, since: Date) {
    return Promise.resolve(
      this.rows.filter(
        (row) => row.authorId === authorId && row.status === "pending" && row.createdAt >= since,
      ).length,
    );
  }

  public failStale(olderThan: Date, limit: number) {
    let failed = 0;
    for (const [at, row] of this.rows.entries()) {
      if (failed >= limit) break;
      if (row.status !== "pending" || row.createdAt >= olderThan) continue;
      this.rows[at] = { ...row, status: "failed" };
      failed += 1;
    }
    return Promise.resolve(failed);
  }
}

export class Usage implements AssistantUsageRepository {
  public readonly rows: AssistantUsageRecord[] = [];

  public save(row: AssistantUsageRecord) {
    this.rows.push(row);
    return Promise.resolve();
  }

  public totalSince() {
    return Promise.resolve({ inputTokens: 0, outputTokens: 0 });
  }
}

export class Stream {
  public readonly frames: AssistantFrameBody[] = [];
  public readonly cancelled = new Set<string>();

  public publish(_messageId: string, frame: AssistantFrameBody) {
    this.frames.push(frame);
    return Promise.resolve();
  }

  public requestCancel(messageId: string) {
    this.cancelled.add(messageId);
    return Promise.resolve();
  }

  public isCancelRequested(messageId: string) {
    return Promise.resolve(this.cancelled.has(messageId));
  }

  public text(): string {
    return this.frames.map((frame) => (frame.kind === "text" ? frame.text : "")).join("");
  }
}

export class Realtime implements RealtimePublisher {
  public readonly sent: RealtimeMessage[] = [];

  public publish(_channel: never, message: RealtimeMessage) {
    this.sent.push(message);
    return Promise.resolve();
  }
}

export class Budget implements AssistantBudgetStore {
  public total = 0;

  public add(_organizationId: OrganizationId, _day: string, tokens: number) {
    this.total += tokens;
    return Promise.resolve(this.total);
  }

  public used() {
    return Promise.resolve(this.total);
  }
}

export class Queue implements QueuePublisher {
  public readonly jobs: { queue: string; payload: unknown; options: unknown }[] = [];

  public publish<T>(queue: string, payload: T, options?: unknown) {
    this.jobs.push({ queue, payload, options });
    return Promise.resolve();
  }

  public publishMany() {
    return Promise.resolve();
  }
}

export class Activity implements ActivityLogger {
  public readonly actions: string[] = [];

  public record(_actor: Principal, action: string) {
    this.actions.push(action);
    return Promise.resolve();
  }
}

export class Direct implements UnitOfWork {
  public runs = 0;

  public run<T>(work: () => Promise<T>): Promise<T> {
    this.runs += 1;
    return work();
  }
}

// Streams `parts` in order, then the usage it was given, then a stop. `fail` throws after
// the parts, which is what a provider dropping mid-answer looks like.
export class Model implements AssistantModel {
  public readonly model = "scripted";
  public readonly contextTokens = 8_000;
  public readonly requests: AssistantRequest[] = [];

  public constructor(
    private readonly parts: readonly string[],
    private readonly options: {
      readonly usage?: { inputTokens: number; outputTokens: number };
      readonly fail?: Error;
      readonly onPart?: (index: number) => Promise<void> | void;
    } = {},
  ) {}

  public async *stream(request: AssistantRequest): AsyncIterable<AssistantDelta> {
    this.requests.push(request);
    for (const [index, text] of this.parts.entries()) {
      await this.options.onPart?.(index);
      yield { kind: "text", text };
    }
    if (this.options.fail) throw this.options.fail;
    if (this.options.usage) yield { kind: "usage", ...this.options.usage };
    yield { kind: "stop", reason: "stop" };
  }
}

export const frames = (list: readonly AssistantFrame[]) => list.map((frame) => frame.kind);
