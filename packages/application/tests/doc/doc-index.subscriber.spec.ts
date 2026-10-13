import { type DomainEvent, Identifiers } from "@loadbearing/contracts";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type { DocumentIndexPublisher, DocumentIndexRequest } from "../../src/ai/index.js";
import { DocIndexSubscriber } from "../../src/doc/doc-index.subscriber.js";
import type {
  DocPagePublishedRecord,
  DocPageRepository,
} from "../../src/doc/doc-page.repository.js";
import type { DocSpaceRepository } from "../../src/doc/doc-space.repository.js";
import { ReindexDocsUseCase } from "../../src/doc/reindex-docs.use-case.js";
import type { UnitOfWork, VectorStore } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const USER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const SPACE = Identifiers.docSpaceId.parse("018f8c00-0000-7000-8000-0000000000a1");
const PAGE = Identifiers.docPageId.parse("018f8c00-0000-7000-8000-0000000000b1");
const CHILD = Identifiers.docPageId.parse("018f8c00-0000-7000-8000-0000000000b2");
const AT = new Date("2026-10-14T00:00:00Z");

const published = (revisionNo: number): DocPagePublishedRecord => ({
  id: PAGE,
  spaceId: SPACE,
  title: "Keys",
  description: "How keys work",
  html: "<p>x</p>",
  toc: [],
  markdown: "Rotate every key.",
  revisionNo,
  publishedAt: AT,
});

const event = (name: string, payload: unknown) =>
  ({ id: "e1", organizationId: ORG, name, actorId: USER, occurredAt: AT, payload }) as DomainEvent;

const harness = (page: DocPagePublishedRecord | null) => {
  const queued: DocumentIndexRequest[] = [];
  const deleted: string[] = [];
  const pages = { findPublished: () => Promise.resolve(page) } as unknown as DocPageRepository;
  const vectors = {
    deleteBySource: (_org: unknown, sourceId: string) => {
      deleted.push(sourceId);
      return Promise.resolve();
    },
  } as unknown as VectorStore;
  const publisher = {
    publish: (request: DocumentIndexRequest) => {
      queued.push(request);
      return Promise.resolve();
    },
  } as unknown as DocumentIndexPublisher;
  const unitOfWork = { run: <T>(work: () => Promise<T>) => work() } as UnitOfWork;
  return {
    queued,
    deleted,
    subscriber: new DocIndexSubscriber(pages, vectors, publisher, unitOfWork),
  };
};

describe("DocIndexSubscriber", () => {
  it("queues a published page as one doc document that names its space", async () => {
    const { subscriber, queued } = harness(published(3));

    await subscriber.handle(
      event("doc.page.published", { spaceId: SPACE, pageId: PAGE, revisionNo: 3 }),
    );

    expect(queued).toEqual([
      {
        organizationId: ORG,
        documentId: PAGE,
        text: "Keys\n\nHow keys work\n\nRotate every key.",
        goalId: null,
        sourceType: "doc",
        version: AT.getTime(),
        metadata: { spaceId: SPACE },
      },
    ]);
  });

  // The later publish has its own event; indexing the older one would only be replaced.
  it("skips a publish a later one has already overtaken", async () => {
    const { subscriber, queued } = harness(published(4));

    await subscriber.handle(
      event("doc.page.published", { spaceId: SPACE, pageId: PAGE, revisionNo: 3 }),
    );

    expect(queued).toEqual([]);
  });

  it("skips a page deleted before the event arrived", async () => {
    const { subscriber, queued } = harness(null);

    await subscriber.handle(
      event("doc.page.published", { spaceId: SPACE, pageId: PAGE, revisionNo: 3 }),
    );

    expect(queued).toEqual([]);
  });

  it("forgets every page a delete removed, the subtree included", async () => {
    const { subscriber, deleted } = harness(null);

    await subscriber.handle(event("doc.page.deleted", { spaceId: SPACE, pageIds: [PAGE, CHILD] }));

    expect(deleted).toEqual([PAGE, CHILD]);
  });

  it("forgets every page of a deleted space", async () => {
    const { subscriber, deleted } = harness(null);

    await subscriber.handle(event("doc.space.deleted", { spaceId: SPACE, pageIds: [PAGE] }));

    expect(deleted).toEqual([PAGE]);
  });
});

describe("ReindexDocsUseCase", () => {
  const actor = (grants: readonly string[]) =>
    new Principal(
      ORG,
      USER,
      CapabilitySet.from({
        wildcard: false,
        org: { grants: grants as never, denies: [] },
        goals: {},
      }),
    );

  const build = () => {
    const queued: DocumentIndexRequest[] = [];
    const spaces = {
      list: () => Promise.resolve([{ id: SPACE }]),
    } as unknown as DocSpaceRepository;
    const pages = {
      listBySpace: () =>
        Promise.resolve([
          { id: PAGE, kind: "page" },
          { id: CHILD, kind: "link" },
        ]),
      findPublished: (_org: unknown, pageId: string) =>
        Promise.resolve(pageId === PAGE ? published(1) : null),
    } as unknown as DocPageRepository;
    const publisher = {
      publish: (request: DocumentIndexRequest) => {
        queued.push(request);
        return Promise.resolve();
      },
    } as unknown as DocumentIndexPublisher;
    return {
      queued,
      useCase: new ReindexDocsUseCase(new Authorizer(), spaces, pages, publisher, {
        now: () => AT,
      }),
    };
  };

  it("queues every published page, and nothing that is not a page", async () => {
    const { useCase, queued } = build();

    const result = await useCase.execute(actor(["ai.embedding.write"]));

    expect(result).toEqual({ pages: 1 });
    expect(queued.map((request) => request.documentId)).toEqual([PAGE]);
  });

  it("refuses a principal without ai.embedding.write", async () => {
    const { useCase } = build();

    await expect(useCase.execute(actor([]))).rejects.toThrow();
  });
});
