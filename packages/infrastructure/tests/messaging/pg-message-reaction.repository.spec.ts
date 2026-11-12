import { Uuid } from "@loadbearing/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgMessageReactionRepository } from "../../src/pg/repository/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });
beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

let database: Database;
let reactions: PgMessageReactionRepository;

beforeAll(() => {
  database = openDatabase();
  reactions = new PgMessageReactionRepository(
    DatabaseCluster.single(database),
    new TransactionScope(),
    shards,
  );
});

afterAll(async () => {
  await database.close();
});

// Inside the current UTC month, which always has a partition.
const now = new Date();
const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 5));

describe("PgMessageReactionRepository", () => {
  it("keeps one row per person and emoji, counts them, and marks the reader's own", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const conversationId = Uuid.v7() as never;
    const messageId = Uuid.v7() as never;
    const [ada, grace] = [Uuid.v7() as never, Uuid.v7() as never];
    const key = (userId: never, emoji: "👍" | "🎉") => ({
      organizationId,
      conversationId,
      messageId,
      messageCreatedAt: at,
      userId,
      emoji,
    });

    await reactions.add(key(ada, "👍"));
    await reactions.add(key(ada, "👍"));
    await reactions.add(key(grace, "👍"));
    await reactions.add(key(grace, "🎉"));

    const seen = await reactions.summaries(
      organizationId,
      conversationId,
      [messageId],
      at,
      at,
      ada,
    );
    expect(seen.get(messageId)).toEqual([
      { emoji: "🎉", count: 1, mine: false },
      { emoji: "👍", count: 2, mine: true },
    ]);

    for (const [userId, emoji] of [
      [ada, "👍"],
      [grace, "👍"],
      [grace, "🎉"],
    ] as const) {
      await reactions.remove(key(userId, emoji));
    }
    const gone = await reactions.summaries(
      organizationId,
      conversationId,
      [messageId],
      at,
      at,
      ada,
    );
    expect(gone.get(messageId)).toBeUndefined();
  });
});
