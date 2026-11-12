import { Uuid } from "@loadbearing/core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgMessageAttachmentRepository } from "../../src/pg/repository/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });
beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

let database: Database;
let attachments: PgMessageAttachmentRepository;

beforeAll(() => {
  database = openDatabase();
  attachments = new PgMessageAttachmentRepository(
    DatabaseCluster.single(database),
    new TransactionScope(),
    shards,
  );
});

afterAll(async () => {
  await database.close();
});

const now = new Date();
const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 5));

describe("PgMessageAttachmentRepository", () => {
  it("lists a page's files by message, and finds one in its room alone", async () => {
    const organizationId = (await seedOrganizationId(database)) as never;
    const [room, other] = [Uuid.v7() as never, Uuid.v7() as never];
    const messageId = Uuid.v7() as never;
    const file = Uuid.v7();
    await attachments.saveMany([
      {
        id: file,
        organizationId,
        conversationId: room,
        messageId,
        uploaderId: Uuid.v7() as never,
        name: "plan.pdf",
        contentType: "application/pdf",
        size: 2048,
        createdAt: at,
      },
    ]);

    const page = await attachments.forMessages(organizationId, room, [messageId], at, at);
    expect(page.get(messageId)).toEqual([
      { id: file, name: "plan.pdf", contentType: "application/pdf", size: 2048 },
    ]);
    expect(await attachments.findById(organizationId, room, file, at)).toMatchObject({
      size: 2048,
    });
    expect(await attachments.findById(organizationId, other, file, at)).toBeNull();
  });
});
