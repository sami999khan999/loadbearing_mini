import {
  ChunkSource,
  type DocumentIndexPublisher,
  type DocumentIndexRequest,
} from "../ai/index.js";
import type { DocPageId, DomainEvent, DomainEventName, OrganizationId } from "../import.js";
import type { UnitOfWork, VectorStore } from "../port/index.js";
import { EventSubscriber } from "../subscriber/index.js";
import type { DocPagePublishedRecord, DocPageRepository } from "./doc-page.repository.js";

const EVENTS: readonly DomainEventName[] = [
  "doc.page.published",
  "doc.page.deleted",
  "doc.space.deleted",
];

// Keeps the semantic index of a tenant's published Docs in step with them (`DC.2`). Every
// chunk is `ChunkSource.DOC` and names its space, which is what `DocSearch` filters on.
export class DocIndexSubscriber extends EventSubscriber {
  public readonly name = "doc-index";
  public readonly events = EVENTS;

  public constructor(
    private readonly pages: DocPageRepository,
    private readonly vectors: VectorStore,
    private readonly publisher: DocumentIndexPublisher,
    private readonly unitOfWork: UnitOfWork,
  ) {
    super();
  }

  // Idempotent: a repeated publish queues a job the in-flight id or the version check drops,
  // and a repeated delete finds nothing left to delete.
  public async handle(event: DomainEvent): Promise<void> {
    if (event.name === "doc.page.published") {
      const page = await this.pages.findPublished(event.organizationId, event.payload.pageId);
      // Gone since, or published again: the later publish has its own event, and indexing
      // this one too would only queue work its successor replaces.
      if (!page || page.revisionNo !== event.payload.revisionNo) return;
      await this.publisher.publish(DocIndexSubscriber.request(event.organizationId, page, event));
      return;
    }

    if (event.name === "doc.page.deleted" || event.name === "doc.space.deleted") {
      await this.forget(event.organizationId, event.payload.pageIds);
    }
  }

  // One document per page, its source id the page's. The markdown, not the rendered HTML:
  // the words a reader searches for, without the markup a renderer adds.
  public static request(
    organizationId: OrganizationId,
    page: DocPagePublishedRecord,
    event: { readonly occurredAt: Date },
  ): DocumentIndexRequest {
    return {
      organizationId,
      documentId: page.id,
      text: [page.title, page.description ?? "", page.markdown].join("\n\n"),
      goalId: null,
      sourceType: ChunkSource.DOC,
      version: event.occurredAt.getTime(),
      metadata: { spaceId: page.spaceId },
    };
  }

  private async forget(
    organizationId: OrganizationId,
    pageIds: readonly DocPageId[],
  ): Promise<void> {
    if (pageIds.length === 0) return;
    await this.unitOfWork.run(async () => {
      for (const pageId of pageIds) await this.vectors.deleteBySource(organizationId, pageId);
    });
  }
}
