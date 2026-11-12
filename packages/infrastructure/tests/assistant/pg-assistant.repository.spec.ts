import { Identifiers } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import {
  PgAssistantMessageRepository,
  PgAssistantThreadRepository,
  PgAssistantUsageRepository,
} from "../../src/pg/repository/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });
beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

let database: Database;
let threads: PgAssistantThreadRepository;
let messages: PgAssistantMessageRepository;
let usage: PgAssistantUsageRepository;

beforeAll(() => {
  database = openDatabase();
  const cluster = DatabaseCluster.single(database);
  const scope = new TransactionScope();
  threads = new PgAssistantThreadRepository(cluster, scope, shards);
  messages = new PgAssistantMessageRepository(cluster, scope, shards);
  usage = new PgAssistantUsageRepository(cluster, scope, shards);
});

afterAll(async () => {
  await database.close();
});

const AUTHOR = Identifiers.userId.parse(Uuid.v7());
const OTHER = Identifiers.userId.parse(Uuid.v7());
// The first of the current UTC month, which always has a partition: a fixed day stops
// having one on a fresh database once the runway has moved past it.
const now = new Date();
const at = (minutes: number) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, minutes));

const thread = (organizationId: never, authorId = AUTHOR, minutes = 0) => ({
  id: Uuid.v7(),
  organizationId,
  authorId,
  title: "Rotating keys",
  createdAt: at(minutes),
  updatedAt: at(minutes),
});

const message = (
  organizationId: never,
  threadId: string,
  minutes: number,
  role: "user" | "assistant",
) => ({
  id: Uuid.v7(),
  organizationId,
  threadId,
  authorId: AUTHOR,
  role,
  content: role === "user" ? `question ${minutes}` : "",
  status: role === "user" ? ("complete" as const) : ("pending" as const),
  sources: [],
  model: null,
  createdAt: at(minutes),
  completedAt: null,
});

describe("PgAssistantThreadRepository", () => {
  it("finds a thread for its author only, and lists newest activity first, a page at a time", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const first = thread(organizationId, AUTHOR, 1);
    const second = thread(organizationId, AUTHOR, 2);
    const theirs = thread(organizationId, OTHER, 3);
    for (const each of [first, second, theirs]) await threads.save(each);

    try {
      expect((await threads.findById(organizationId, AUTHOR, first.id))?.title).toBe(
        "Rotating keys",
      );
      // Another person's thread is not found: the same answer a missing one gets.
      expect(await threads.findById(organizationId, AUTHOR, theirs.id)).toBeNull();

      const page = await threads.listByAuthor(organizationId, AUTHOR, 1, null);
      expect(page.map((each) => each.id)).toEqual([second.id]);
      const next = await threads.listByAuthor(organizationId, AUTHOR, 10, {
        updatedAt: second.updatedAt,
        id: second.id,
      });
      expect(next.map((each) => each.id)).toEqual([first.id]);

      await threads.touch(organizationId, first.id, at(9));
      expect((await threads.listByAuthor(organizationId, AUTHOR, 1, null))[0]?.id).toBe(first.id);
    } finally {
      for (const each of [first, second, theirs]) await threads.delete(organizationId, each.id);
    }
    expect(await threads.findById(organizationId, AUTHOR, first.id)).toBeNull();
  });
});

describe("PgAssistantMessageRepository", () => {
  it("lists a thread oldest first and settles a pending answer exactly once", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const threadId = Uuid.v7();
    const question = message(organizationId, threadId, 1, "user");
    const answer = message(organizationId, threadId, 2, "assistant");
    await messages.insert(question);
    await messages.insert(answer);

    try {
      const listed = await messages.listByThread(organizationId, threadId, 10);
      expect(listed.map((each) => each.id)).toEqual([question.id, answer.id]);

      const settlement = {
        content: "Quarterly.",
        status: "complete" as const,
        sources: [{ kind: "doc" as const, id: Uuid.v7(), title: "Keys", path: "keys" }],
        model: "scripted",
        completedAt: at(3),
      };
      expect(await messages.settle(organizationId, threadId, answer.id, settlement)).toBe(true);
      // A retried settle cannot overwrite a finished answer.
      expect(
        await messages.settle(organizationId, threadId, answer.id, { ...settlement, content: "x" }),
      ).toBe(false);

      const settled = await messages.findInThread(organizationId, threadId, answer.id);
      expect(settled).toMatchObject({
        content: "Quarterly.",
        status: "complete",
        sources: settlement.sources,
      });
    } finally {
      await messages.deleteByThread(organizationId, threadId);
    }
    expect(await messages.listByThread(organizationId, threadId, 10)).toEqual([]);
  });

  it("fails only the pending answers older than the cut-off", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const threadId = Uuid.v7();
    const stale = message(organizationId, threadId, 1, "assistant");
    const fresh = message(organizationId, threadId, 30, "assistant");
    await messages.insert(stale);
    await messages.insert(fresh);

    try {
      // Across the node's tenants, so other specs' stale rows may be swept with this one.
      expect(await messages.failStale(at(10), 500)).toBeGreaterThanOrEqual(1);
      expect((await messages.findInThread(organizationId, threadId, stale.id))?.status).toBe(
        "failed",
      );
      expect((await messages.findInThread(organizationId, threadId, fresh.id))?.status).toBe(
        "pending",
      );
    } finally {
      await messages.deleteByThread(organizationId, threadId);
    }
  });

  it("counts the asker's pending answers since a moment, and no one else's", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const threadId = Uuid.v7();
    const old = message(organizationId, threadId, 1, "assistant");
    const running = message(organizationId, threadId, 20, "assistant");
    const theirs = { ...message(organizationId, threadId, 21, "assistant"), authorId: OTHER };
    for (const each of [old, running, theirs]) await messages.insert(each);

    try {
      expect(await messages.countPending(organizationId, AUTHOR, at(10))).toBe(1);
      await messages.settle(organizationId, threadId, running.id, {
        content: "",
        status: "cancelled",
        sources: [],
        model: null,
        completedAt: at(22),
      });
      expect(await messages.countPending(organizationId, AUTHOR, at(10))).toBe(0);
    } finally {
      await messages.deleteByThread(organizationId, threadId);
    }
  });
});

describe("PgAssistantUsageRepository", () => {
  it("sums a tenant's tokens since a moment, and nothing before it", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const threadId = Uuid.v7();
    const before = await usage.totalSince(organizationId, at(5));
    const row = (minutes: number, inputTokens: number) => ({
      id: Uuid.v7(),
      organizationId,
      userId: AUTHOR,
      threadId,
      messageId: Uuid.v7(),
      model: "scripted",
      inputTokens,
      outputTokens: 1,
      createdAt: at(minutes),
    });
    await usage.save(row(1, 100));
    await usage.save(row(6, 40));

    const after = await usage.totalSince(organizationId, at(5));
    expect(after.inputTokens - before.inputTokens).toBe(40);
    expect(after.outputTokens - before.outputTokens).toBe(1);
  });
});
