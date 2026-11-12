import { Uuid } from "@loadbearing/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgPushSubscriptionRepository } from "../../src/pg/repository/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });
beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

let database: Database;
let subscriptions: PgPushSubscriptionRepository;

beforeAll(() => {
  database = openDatabase();
  subscriptions = new PgPushSubscriptionRepository(
    DatabaseCluster.single(database),
    new TransactionScope(),
    shards,
  );
});

afterAll(async () => {
  await database.close();
});

// `26.3`: one row per browser, moved rather than doubled when the browser re-subscribes.
describe("PgPushSubscriptionRepository", () => {
  it("keeps one row per endpoint, reads a set of users, and deletes by owner or outright", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const [ada, grace] = [Uuid.v7() as never, Uuid.v7() as never];
    const target = (endpoint: string, auth = "a") => ({ endpoint, p256dh: "k", auth });

    await subscriptions.save(organizationId, ada, target("https://push.test/1"));
    // The same browser, handed to another person: the row moves to them.
    await subscriptions.save(organizationId, grace, target("https://push.test/1", "b"));
    await subscriptions.save(organizationId, ada, target("https://push.test/2"));

    const rows = await subscriptions.forUsers(organizationId, [ada, grace]);
    expect(rows.map((row) => [row.endpoint, row.userId, row.auth]).sort()).toEqual([
      ["https://push.test/1", grace, "b"],
      ["https://push.test/2", ada, "a"],
    ]);

    // Ada naming Grace's endpoint removes nothing.
    await subscriptions.delete(organizationId, "https://push.test/1", ada);
    expect(await subscriptions.forUsers(organizationId, [grace])).toHaveLength(1);

    await subscriptions.delete(organizationId, "https://push.test/1", null);
    expect(await subscriptions.forUsers(organizationId, [grace])).toEqual([]);
  });
});
