import {
  type ActivityLogger,
  Authorizer,
  type DocCache,
  DocTree,
  MoveDocPageUseCase,
  Principal,
} from "@loadbearing/application";
import {
  type DocPageId,
  type DocSpaceId,
  Identifiers,
  type OrganizationId,
} from "@loadbearing/contracts";
import { Uuid } from "@loadbearing/core";
import { CapabilitySet } from "@loadbearing/permissions";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type Database, DatabaseCluster } from "../../src/pg/primitive/index.js";
import { PgDocPageRepository } from "../../src/pg/repository/pg-doc-page.repository.js";
import { PgDocSpaceRepository } from "../../src/pg/repository/pg-doc-space.repository.js";
import { PgUnitOfWork, ShardScope, TransactionScope } from "../../src/pg/transaction/index.js";
import { openDatabase, seedOrganizationId } from "../support/database.js";

// One node, so nothing is ever placed: every repository here resolves to it.
const shards = new ShardScope();
const placeOnTheOneNode = () => shards.enter({ key: "spec" as never, node: 0 });

beforeAll(placeOnTheOneNode);
beforeEach(placeOnTheOneNode);

// Holds each reader until the other has read too, or a moment has passed. With no lock
// both transactions read the same snapshot; with one, the second can never arrive.
class RendezvousPages extends PgDocPageRepository {
  private waiting = 0;
  private release: (() => void) | null = null;

  public override async listBySpace(
    ...args: Parameters<PgDocPageRepository["listBySpace"]>
  ): ReturnType<PgDocPageRepository["listBySpace"]> {
    const nodes = await super.listBySpace(...args);
    this.waiting += 1;
    if (this.waiting % 2 === 0) {
      this.release?.();
      this.release = null;
    } else {
      await new Promise<void>((resolve) => {
        this.release = resolve;
        setTimeout(resolve, 600);
      });
    }
    return nodes;
  }
}

let database: Database;
let organizationId: OrganizationId;
let pages: RendezvousPages;
let spaces: PgDocSpaceRepository;
let move: MoveDocPageUseCase;

const author = Identifiers.userId.parse(Uuid.v7());
const spaceId = Identifiers.docSpaceId.parse(Uuid.v7()) as DocSpaceId;
const actor = () =>
  new Principal(
    organizationId,
    author,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: ["doc.page.write"], denies: [] },
      goals: {},
    }),
  );

const newPage = async (slug: string): Promise<DocPageId> => {
  const id = Identifiers.docPageId.parse(Uuid.v7());
  await pages.create(organizationId, {
    id,
    spaceId,
    parentId: null,
    kind: "section",
    slug,
    title: slug,
    icon: null,
    url: null,
    position: 0,
    createdBy: author,
  });
  return id;
};

beforeAll(async () => {
  database = openDatabase();
  organizationId = await seedOrganizationId(database);
  const scope = new TransactionScope();
  const cluster = DatabaseCluster.single(database);
  spaces = new PgDocSpaceRepository(cluster, scope, shards);
  pages = new RendezvousPages(cluster, scope, shards);
  move = new MoveDocPageUseCase(
    new Authorizer(),
    spaces,
    pages,
    new DocTree(pages, spaces),
    { forget: () => Promise.resolve() } as unknown as DocCache,
    { record: () => Promise.resolve() } as unknown as ActivityLogger,
    new PgUnitOfWork(cluster, scope, shards, "routed"),
  );
  await spaces.create(
    organizationId,
    spaceId,
    {
      slug: `tree-lock-${spaceId.slice(-12)}`,
      title: "Tree lock",
      description: null,
      icon: null,
      audience: "members",
      theme: null,
      access: null,
      repositoryUrl: null,
    },
    author,
  );
});

afterAll(async () => {
  await pages.deleteBySpace(organizationId, spaceId);
  await spaces.delete(organizationId, spaceId);
  await database.close();
});

describe("structural doc edits", () => {
  // Each move is valid against the tree it read; together they make A and B each other's
  // parent, which no later read can walk out of.
  it("cannot both commit a cycle", async () => {
    const a = await newPage(`a-${Uuid.v7().slice(-8)}`);
    const b = await newPage(`b-${Uuid.v7().slice(-8)}`);

    const results = await Promise.allSettled([
      move.execute(actor(), { pageId: a, parentId: b, position: 0 }),
      move.execute(actor(), { pageId: b, parentId: a, position: 0 }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const nodes = await pages.listBySpace(organizationId, spaceId);
    const parents = new Map(nodes.map((node) => [node.id, node.parentId]));
    expect(parents.get(a) === b && parents.get(b) === a).toBe(false);
  });
});
