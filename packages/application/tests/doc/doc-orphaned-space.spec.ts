import { Identifiers, type UserId } from "@loadbearing/contracts";
import { ForbiddenError, NotFoundError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { DeleteDocSpaceUseCase } from "../../src/doc/delete-doc-space.use-case.js";
import { ListOrphanedDocSpacesUseCase } from "../../src/doc/list-orphaned-doc-spaces.use-case.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const MANAGER = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const GONE = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000012");
const STAYING = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000013");
const spaceId = (n: number) =>
  Identifiers.docSpaceId.parse(`018f8c00-0000-7000-8000-${String(n).padStart(12, "0")}`);

const space = (n: number, audience: string, createdBy: UserId) => ({
  id: spaceId(n),
  organizationId: ORG,
  slug: `s-${n}`,
  title: `Secret ${n}`,
  audience,
  createdBy,
});

const SPACES = [space(1, "owner", GONE), space(2, "owner", STAYING), space(3, "members", GONE)];

const actor = (...grants: PermissionKey[]) =>
  new Principal(
    ORG,
    MANAGER,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );

const memberships = {
  isActiveMember: (_org: unknown, userId: UserId) => Promise.resolve(userId !== GONE),
  activeMemberIds: (_org: unknown, userIds: readonly UserId[]) =>
    Promise.resolve(new Set(userIds.filter((userId) => userId !== GONE))),
};

// `BL.15`. Only its author could read, rename or delete an `owner` space, so one whose
// author had left stayed, slug and pages, until the whole tenant was purged.
describe("ListOrphanedDocSpacesUseCase", () => {
  const list = () =>
    new ListOrphanedDocSpacesUseCase(
      new Authorizer(),
      { list: () => Promise.resolve(SPACES) } as never,
      memberships as never,
    );

  it("names a departed author's private spaces by slug, and nothing else", async () => {
    const result = await list().execute(actor("doc.space.manage"));
    expect(result.items).toEqual([{ id: spaceId(1), slug: "s-1" }]);
  });

  it("is a manager's question", async () => {
    await expect(list().execute(actor("doc.page.read"))).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("DeleteDocSpaceUseCase on another author's private space", () => {
  // Memberships are catalog tables, which a routed transaction refuses: the real adapter
  // threw "A catalog table inside a routed transaction" and the delete was a 500.
  let inside = false;
  const outsideOnly = {
    isActiveMember: (org: unknown, userId: UserId) => {
      if (inside) throw new Error("A catalog table inside a routed transaction.");
      return memberships.isActiveMember(org, userId);
    },
  };

  const remove = () => {
    const deleted: string[] = [];
    const useCase = new DeleteDocSpaceUseCase(
      new Authorizer(),
      {
        findById: (_org: unknown, id: string) =>
          Promise.resolve(SPACES.find((each) => each.id === id) ?? null),
        delete: (_org: unknown, id: string) => {
          deleted.push(id);
          return Promise.resolve();
        },
      } as never,
      outsideOnly as never,
      {
        listBySpace: () => Promise.resolve([]),
        deleteBySpace: () => Promise.resolve(),
      } as never,
      { deleteBySpace: () => Promise.resolve() } as never,
      { forget: () => Promise.resolve() } as never,
      { forget: () => Promise.resolve() } as never,
      { record: () => Promise.resolve() } as never,
      {
        run: async (work: () => Promise<unknown>) => {
          inside = true;
          try {
            return await work();
          } finally {
            inside = false;
          }
        },
      } as never,
      { sweep: () => Promise.resolve() } as never,
      { publish: () => Promise.resolve() } as never,
    );
    return { deleted, useCase };
  };

  it("deletes it once the author has left", async () => {
    const { deleted, useCase } = remove();
    await useCase.execute(actor("doc.space.manage"), { spaceId: spaceId(1) });
    expect(deleted).toEqual([spaceId(1)]);
  });

  it("is still not found while the author is a member", async () => {
    const { deleted, useCase } = remove();
    await expect(
      useCase.execute(actor("doc.space.manage"), { spaceId: spaceId(2) }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(deleted).toEqual([]);
  });
});
