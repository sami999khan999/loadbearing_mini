import type { DocSpaceOrphanListDto } from "../import.js";
import type { TenantMembershipReader } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { DocCache } from "./doc.cache.js";

// `owner` spaces whose author has left, which nobody else could ever delete. A manager
// sees the slug, never the title or a page, and may only delete it. See doc.md.
export class ListOrphanedDocSpacesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly spaces: DocCache,
    private readonly memberships: TenantMembershipReader,
  ) {}

  public async execute(actor: Principal): Promise<DocSpaceOrphanListDto> {
    this.authorizer.assert(actor, "doc.space.manage");
    const owned = (await this.spaces.list(actor.organizationId)).filter(
      (space) => space.audience === "owner",
    );
    if (owned.length === 0) return { items: [] };

    const authors = [...new Set(owned.map((space) => space.createdBy))];
    const active = await this.memberships.activeMemberIds(actor.organizationId, authors);
    const items = owned
      .filter((space) => !active.has(space.createdBy))
      .map((space) => ({ id: space.id, slug: space.slug }));
    return { items };
  }
}
