import { type Clock, Uuid, ValidationError } from "../import.js";
import type { VectorStore } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import { ChunkSource } from "./chunk-source.js";
import type { DocumentIndexPublisher } from "./document-index.publisher.js";

export interface QueueDocumentIndexInput {
  // Optional: a caller re-indexing an existing document supplies its id, and a caller
  // pasting new text does not.
  readonly documentId?: string;
  readonly text: string;
  readonly goalId?: string | null;
  readonly sourceType?: string;
}

export interface QueuedDocumentIndex {
  readonly documentId: string;
}

// Embedding is a network round trip per document and is rate-limited by the provider,
// so the request enqueues and returns rather than holding a connection open for it.
export class QueueDocumentIndexUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly publisher: DocumentIndexPublisher,
    private readonly vectors: VectorStore,
    private readonly clock: Clock,
  ) {}

  public async execute(
    actor: Principal,
    input: QueueDocumentIndexInput,
  ): Promise<QueuedDocumentIndex> {
    // The same key `IndexDocumentUseCase` asserts when the consumer runs it. Checked
    // here too: a job that will be refused should never reach the queue.
    // ──
    // For the goal it is going into, and below for the goal it is in now: a writer could
    // replace any document in the tenant by id, goals they cannot read included (`CR.8`).
    this.authorizer.assert(actor, "ai.embedding.write", input.goalId ?? undefined);

    if (input.text.trim().length === 0) {
      throw new ValidationError([{ field: "text", rule: "required" }]);
    }
    // A guarded type's chunks are read under another slice's rule, and only that slice may
    // write them: a `doc` chunk queued here would sit beside the pages with none of it.
    if (input.sourceType !== undefined && ChunkSource.isGuarded(input.sourceType)) {
      throw new ValidationError([{ field: "sourceType", rule: "reserved" }]);
    }

    const documentId = input.documentId ?? Uuid.v7();
    if (input.documentId !== undefined) {
      const indexed = await this.vectors.sourceOf(actor.organizationId, input.documentId);
      if (indexed?.goalId) this.authorizer.assert(actor, "ai.embedding.write", indexed.goalId);
      if (indexed && ChunkSource.isGuarded(indexed.sourceType)) {
        throw new ValidationError([{ field: "documentId", rule: "reserved" }]);
      }
    }

    // When the request was made, so a retried older job landing after a newer one
    // is skipped rather than serving the stale text (`CR.33`).
    const version = this.clock.now().getTime();

    await this.publisher.publish({
      organizationId: actor.organizationId,
      documentId,
      text: input.text,
      goalId: input.goalId ?? null,
      sourceType: input.sourceType ?? "document",
      version,
    });

    return { documentId };
  }
}
