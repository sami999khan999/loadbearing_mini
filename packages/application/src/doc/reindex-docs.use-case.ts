import type { DocumentIndexPublisher } from "../ai/index.js";
import type { Clock } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import { DocIndexSubscriber } from "./doc-index.subscriber.js";
import type { DocPageRepository } from "./doc-page.repository.js";
import type { DocSpaceRepository } from "./doc-space.repository.js";

export interface ReindexDocsResult {
  readonly pages: number;
}

// Queues every published page of one tenant into the semantic index: the backfill for pages
// published before `DC.2`, run by `pnpm ai:reindex --docs`. Later publishes index themselves.
export class ReindexDocsUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly spaces: DocSpaceRepository,
    private readonly pages: DocPageRepository,
    private readonly publisher: DocumentIndexPublisher,
    private readonly clock: Clock,
  ) {}

  public async execute(actor: Principal): Promise<ReindexDocsResult> {
    this.authorizer.assert(actor, "ai.embedding.write");
    const organizationId = actor.organizationId;
    // One instant for the run, so a page published while it runs keeps the newer version.
    const at = { occurredAt: this.clock.now() };
    let queued = 0;

    for (const space of await this.spaces.list(organizationId)) {
      for (const node of await this.pages.listBySpace(organizationId, space.id)) {
        if (node.kind !== "page") continue;
        const page = await this.pages.findPublished(organizationId, node.id);
        if (!page) continue;
        await this.publisher.publish(DocIndexSubscriber.request(organizationId, page, at));
        queued += 1;
      }
    }

    return { pages: queued };
  }
}
