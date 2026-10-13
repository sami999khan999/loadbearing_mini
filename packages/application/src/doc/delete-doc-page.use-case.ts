import { type DocPageRefInput, NotFoundError } from "../import.js";
import type {
  ActivityLogger,
  DomainEventPublisher,
  QueuePublisher,
  UnitOfWork,
} from "../port/index.js";
import { type Authorizer, type Principal, QueueName } from "../primitive/index.js";
import type { DocCache } from "./doc.cache.js";
import { DocRules } from "./doc.rules.js";
import { DocImageOrphans } from "./doc-image-orphans.js";
import type { DocPageRepository } from "./doc-page.repository.js";
import type { DocSpaceRepository } from "./doc-space.repository.js";
import type { DocTree } from "./doc-tree.js";

// The page and everything under it, or the children would hang from a parent no path can
// reach. Its images stay until a later sweep finds nothing linking them.
export class DeleteDocPageUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly spaces: DocSpaceRepository,
    private readonly pages: DocPageRepository,
    private readonly tree: DocTree,
    private readonly cache: DocCache,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
    private readonly queue: QueuePublisher,
    private readonly events: DomainEventPublisher,
  ) {}

  public async execute(actor: Principal, input: DocPageRefInput): Promise<void> {
    this.authorizer.assert(actor, "doc.page.write");
    const organizationId = actor.organizationId;

    const { slug, spaceId } = await this.unitOfWork.run(async () => {
      const page = await this.pages.findDraft(organizationId, input.pageId);
      if (!page) throw new NotFoundError("doc.page", input.pageId);
      DocRules.assertVisible(
        await this.spaces.findById(organizationId, page.spaceId),
        actor.userId,
        "doc.page",
        input.pageId,
      );

      // Before the tree is read, so a concurrent edit waits and then sees this delete.
      await this.tree.lock(organizationId, page.spaceId);
      const nodes = await this.pages.listBySpace(organizationId, page.spaceId);
      if (!nodes.some((node) => node.id === page.id)) {
        throw new NotFoundError("doc.page", input.pageId);
      }
      const ids = DocRules.subtree(nodes, page.id);

      await this.pages.delete(organizationId, ids);
      await this.tree.rebuild(organizationId, page.spaceId);
      await this.activity.record(actor, "doc.page.deleted", {
        spaceId: page.spaceId,
        pageId: page.id,
        count: ids.length,
      });
      await this.events.publish(actor, {
        name: "doc.page.deleted",
        payload: { spaceId: page.spaceId, pageIds: [...ids] },
      });
      const space = await this.spaces.findById(organizationId, page.spaceId);
      return { slug: space?.slug ?? null, spaceId: page.spaceId };
    });

    if (slug !== null) await this.cache.forget(organizationId, slug);

    // One waiting job per space, held back past the grace so the sweep sees this page's
    // newest uploads as old enough; a delete while one waits is covered by it.
    await this.queue.publish(
      QueueName.MAINTENANCE,
      { organizationId, spaceId },
      {
        name: "doc-image-orphans",
        inFlightId: `doc-image-orphans.${spaceId}`,
        delayMs: DocImageOrphans.GRACE_MS + 60_000,
      },
    );
  }
}
