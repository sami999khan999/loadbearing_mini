import { DocImageKey } from "@loadbearing/application";
import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { Database, DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgPartitionArchiveGateway } from "../../src/pg/repository/pg-partition-archive.gateway.js";
import { ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { S3StorageGateway } from "../../src/s3/index.js";
import type {} from "./support/stack.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });
beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

const stack = inject("stack");
const DAY = new Date(Date.UTC(2033, 0, 15));
const storage = new S3StorageGateway(stack.storage);
const database = new Database({ url: stack.database.url });
const gateway = new PgPartitionArchiveGateway(
  DatabaseCluster.single(database),
  new TransactionScope(),
  shards,
  storage,
);

// Organizations that own no rows: the tables export nothing, and the images are the
// whole of what is left to see.
const mine = Identifiers.organizationId.parse(Uuid.v7());
const theirs = Identifiers.organizationId.parse(Uuid.v7());
const written: string[] = [];

const putImage = async (organizationId: OrganizationId, body: string) => {
  const spaceId = Identifiers.docSpaceId.parse(Uuid.v7());
  const key = DocImageKey.key(organizationId, spaceId, DocImageKey.file(Uuid.v7(), "image/png"));
  await storage.put(key, new TextEncoder().encode(body), "image/png");
  written.push(key);
  return key;
};

afterAll(async () => {
  for (const organizationId of [mine, theirs]) {
    for (const key of await storage.list(`export/${organizationId}/`)) await storage.delete(key);
  }
  for (const key of written) await storage.delete(key);
  await database.close();
});

describe("PgPartitionArchiveGateway.exportTenant, doc images", () => {
  it("copies the tenant's images into the export, lists each in the manifest, and no one else's", async () => {
    const first = await putImage(mine, "first image");
    const second = await putImage(mine, "second image, longer");
    await putImage(theirs, "not mine");

    const exported = await gateway.exportTenant(mine, DAY);

    const prefix = DocImageKey.tenantPrefix(mine);
    const copyOf = (key: string) =>
      `export/${mine}/2033-01-15/doc-image/${key.slice(prefix.length)}`;
    const images = exported.objects.filter((object) => object.table === "doc-image");
    expect(images.map((object) => object.key).sort()).toEqual(
      [copyOf(first), copyOf(second)].sort(),
    );
    expect(images.find((object) => object.key === copyOf(second))?.bytes).toBe(20);
    expect(new TextDecoder().decode(await storage.get(copyOf(first)))).toBe("first image");

    const manifest = JSON.parse(new TextDecoder().decode(await storage.get(exported.manifestKey)));
    expect(manifest.objects.map((object: { key: string }) => object.key).sort()).toEqual(
      images.map((object) => object.key).sort(),
    );
    // A copy: the source is where it was, and nothing of the other tenant's came along.
    expect(await storage.exists(first)).toBe(true);
    expect(await storage.list(`export/${mine}/2033-01-15/doc-image/`)).toHaveLength(2);
  });
});
