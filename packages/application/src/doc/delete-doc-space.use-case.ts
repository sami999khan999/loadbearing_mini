import type { DocSpaceId, DocSpaceRefInput, UserId } from "../import.js";
import type {
  ActivityLogger,
  DomainEventPublisher,
  TenantMembershipReader,
  UnitOfWork,
} from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { DocCache } from "./doc.cache.js";
import { DocRules } from "./doc.rules.js";
import type { DocAccess } from "./doc-access.js";
import type { DocGrantRepository } from "./doc-grant.repository.js";
import { DocImageKey } from "./doc-image-key.js";
import type { DocImageSweep } from "./doc-image-sweep.js";
import type { DocPageRepository } from "./doc-page.repository.js";
import type { DocSpaceRepository } from "./doc-space.repository.js";

// The space, every page in it, and every revision of those pages, in one transaction.
export class DeleteDocSpaceUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly spaces: DocSpaceRepository,
    private readonly memberships: TenantMembershipReader,
    private readonly pages: DocPageRepository,
    private readonly grants: DocGrantRepository,
    private readonly access: DocAccess,
    private readonly cache: DocCache,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly images: DocImageSweep,
    private readonly events: DomainEventPublisher,
  ) {}

  public async execute(actor: Principal, input: DocSpaceRefInput): Promise<void> {
    this.authorizer.assert(actor, "doc.space.manage");

    // Another author's `owner` space is not found, unless that author has left: then it is
    // a manager's to delete, unread. Asked first: memberships are catalog, never routed.
    const orphanedBy = await this.departedAuthor(actor, input.spaceId);

    const space = await this.unitOfWork.run(async () => {
      const candidate = await this.spaces.findById(actor.organizationId, input.spaceId);
      const found =
        candidate !== null && orphanedBy !== null && candidate.createdBy === orphanedBy
          ? candidate
          : DocRules.assertVisible(candidate, actor.userId, "doc.space", input.spaceId);

      // Before the delete, which is the last moment the pages can be listed.
      const pageIds = (await this.pages.listBySpace(actor.organizationId, input.spaceId)).map(
        (node) => node.id,
      );
      await this.pages.deleteBySpace(actor.organizationId, input.spaceId);
      await this.spaces.delete(actor.organizationId, input.spaceId);
      await this.activity.record(actor, "doc.space.deleted", {
        spaceId: input.spaceId,
        slug: found.slug,
      });
      await this.events.publish(actor, {
        name: "doc.space.deleted",
        payload: { spaceId: input.spaceId, pageIds },
      });
      return found;
    });

    // After, on the catalog, and never inside the routed transaction: the two are different
    // databases once the deployment splits. Whatever the audience now, since it may have changed.
    await this.grants.deleteBySpace(input.spaceId);
    await this.access.forget();
    await this.cache.forget(actor.organizationId, space.slug);
    // Last: an image that outlives a failure here is unreachable, since its space is gone.
    await this.images.sweep(DocImageKey.spacePrefix(actor.organizationId, input.spaceId));
  }

  // The author of another member's `owner` space when they are no longer an active member.
  private async departedAuthor(actor: Principal, spaceId: DocSpaceId): Promise<UserId | null> {
    const space = await this.spaces.findById(actor.organizationId, spaceId);
    if (space === null || space.audience !== "owner" || space.createdBy === actor.userId) {
      return null;
    }
    const active = await this.memberships.isActiveMember(actor.organizationId, space.createdBy);
    return active ? null : space.createdBy;
  }
}
