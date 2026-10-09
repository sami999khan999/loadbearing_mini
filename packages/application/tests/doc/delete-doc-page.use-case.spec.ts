import { type DocPageId, type DocSpaceId, Identifiers } from "@loadbearing/contracts";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { DeleteDocPageUseCase } from "../../src/doc/delete-doc-page.use-case.js";
import type { JobOptions } from "../../src/port/index.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const USER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const SPACE = Identifiers.docSpaceId.parse("018f8c00-0000-7000-8000-000000000030") as DocSpaceId;
const PAGE = Identifiers.docPageId.parse("018f8c00-0000-7000-8000-0000000000b1") as DocPageId;

const actor = new Principal(
  ORG,
  USER,
  CapabilitySet.from({
    wildcard: false,
    org: { grants: ["doc.page.write"], denies: [] },
    goals: {},
  }),
);

const node = { id: PAGE, spaceId: SPACE, parentId: null };

const build = (events: string[]) => {
  const published: { queue: string; payload: unknown; options?: JobOptions }[] = [];
  const useCase = new DeleteDocPageUseCase(
    new Authorizer(),
    {
      findById: () =>
        Promise.resolve({ slug: "s", audience: "members", organizationId: ORG, createdBy: USER }),
    } as never,
    {
      findDraft: () => Promise.resolve(node),
      listBySpace: () => Promise.resolve([node]),
      delete: () => {
        events.push("deleted");
        return Promise.resolve();
      },
    } as never,
    { lock: () => Promise.resolve(), rebuild: () => Promise.resolve() } as never,
    { forget: () => Promise.resolve() } as never,
    { record: () => Promise.resolve() } as never,
    {
      run: async <T>(work: () => Promise<T>) => {
        const result = await work();
        events.push("committed");
        return result;
      },
    } as never,
    {
      publish: (queue: string, payload: unknown, options?: JobOptions) => {
        events.push("queued");
        published.push({ queue, payload, options });
        return Promise.resolve();
      },
    } as never,
  );
  return { useCase, published };
};

describe("DeleteDocPageUseCase", () => {
  it("queues one image sweep of the page's space after the commit, held past the grace", async () => {
    const events: string[] = [];
    const { useCase, published } = build(events);

    await useCase.execute(actor, { pageId: PAGE });

    expect(events).toEqual(["deleted", "committed", "queued"]);
    expect(published).toEqual([
      {
        queue: "maintenance",
        payload: { organizationId: ORG, spaceId: SPACE },
        options: {
          name: "doc-image-orphans",
          inFlightId: `doc-image-orphans.${SPACE}`,
          delayMs: 61 * 60 * 1000,
        },
      },
    ]);
    expect(published[0]?.options?.inFlightId).not.toContain(":");
  });
});
