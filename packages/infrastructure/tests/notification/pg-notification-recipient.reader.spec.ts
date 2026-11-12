import type { ConversationRepository } from "@loadbearing/application";
import { Identifiers, type OrganizationId, type UserId } from "@loadbearing/contracts";
import { SystemClock, Uuid } from "@loadbearing/core";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/pg/primitive/index.js";
import { DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgActivityLogger } from "../../src/pg/repository/pg-activity.logger.js";
import { PgNotificationRecipientReader } from "../../src/pg/repository/pg-notification-recipient.reader.js";
import { PgOrganizationFounder } from "../../src/pg/repository/pg-organization.founder.js";
import {
  memberships,
  organizations,
  rolePermissions,
  roles,
  users,
} from "../../src/pg/schema/index.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase } from "../support/database.js";
import { RecordingLogger } from "../support/recording.logger.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();

let database: Database;
let reader: PgNotificationRecipientReader;
let organizationId: OrganizationId;
let userId: UserId;

beforeAll(async () => {
  database = openDatabase();
  const scope = new TransactionScope();
  const cluster = DatabaseCluster.single(database);
  userId = Identifiers.userId.parse(Uuid.v7());
  await database.client
    .insert(users)
    .values({ id: userId, name: "Ada", email: `${userId}@example.test`, emailVerified: true });
  organizationId = await new PgOrganizationFounder(
    cluster,
    scope,
    shards,
    new PgActivityLogger(cluster, scope, shards, new SystemClock()),
    new RecordingLogger(),
  ).found(userId, "Recipient target", `recipient-${Uuid.v7()}`);
  reader = new PgNotificationRecipientReader(
    cluster,
    scope,
    shards,
    {} as unknown as ConversationRepository,
  );
});

afterAll(async () => {
  await database.client.delete(memberships).where(eq(memberships.organizationId, organizationId));
  await database.client
    .delete(rolePermissions)
    .where(eq(rolePermissions.organizationId, organizationId));
  await database.client.delete(roles).where(eq(roles.organizationId, organizationId));
  await database.client.delete(organizations).where(eq(organizations.id, organizationId));
  await database.client.delete(users).where(inArray(users.id, [userId]));
  await database.close();
});

const suspend = (at: Date | null) =>
  database.client.update(users).set({ suspendedAt: at }).where(eq(users.id, userId));

const everyRead = async () => ({
  one: await reader.user(organizationId, userId),
  many: await reader.users(organizationId, [userId]),
  page: await reader.organizationMembers(organizationId, null, 50, null),
});

describe("PgNotificationRecipientReader", () => {
  it("returns an active member from every read", async () => {
    await suspend(null);
    const found = await everyRead();

    expect(found.one?.userId).toBe(userId);
    expect(found.many.map((r) => r.userId)).toEqual([userId]);
    expect(found.page.map((r) => r.userId)).toEqual([userId]);
  });

  // A suspended account cannot sign in, so a notification or mail to it is noise.
  it("returns a suspended user from none of them", async () => {
    await suspend(new Date());
    const found = await everyRead();

    expect(found.one).toBeNull();
    expect(found.many).toEqual([]);
    expect(found.page).toEqual([]);
  });
});
