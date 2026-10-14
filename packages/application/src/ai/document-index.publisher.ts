import type { OrganizationId } from "../import.js";
import type { QueuePublisher } from "../port/index.js";
import { JobKey, QueueName } from "../primitive/index.js";
import type { IndexTextStage } from "./index-text-stage.js";

export interface DocumentIndexRequest {
  readonly organizationId: OrganizationId;
  readonly documentId: string;
  readonly text: string;
  readonly goalId: string | null;
  readonly sourceType: string;
  // When the change was made, so a retried older job landing after a newer one is skipped.
  readonly version: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

// What `QueueName.EMBEDDING` carries. The text is in the bucket under `textKey`, never on
// the job: a hundred jobs of 100 KB each is 10 MB of `noeviction` Redis.
export interface IndexDocumentJob {
  readonly organizationId: string;
  readonly documentId: string;
  readonly textKey?: string;
  // Only on a job queued before the text moved to the bucket. Read for one release.
  readonly text?: string;
  readonly goalId?: string | null;
  readonly sourceType?: string;
  // Absent on a job queued before `CR.33`, which then indexes unconditionally.
  readonly version?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

// Stages a document's text and queues its index job: the one way onto the embedding queue,
// for a person's request and for a domain event alike. It authorizes nothing; callers do.
export class DocumentIndexPublisher {
  public constructor(
    private readonly queue: QueuePublisher,
    private readonly stage: IndexTextStage,
  ) {}

  public async publish(request: DocumentIndexRequest): Promise<void> {
    // Before the publish, so no consumer runs ahead of it. A publish that fails, or that the
    // in-flight id below swallows as a double submit, leaves its object to the nightly sweep.
    const textKey = await this.stage.stage(
      request.organizationId,
      request.documentId,
      request.version,
      request.text,
    );

    const job: IndexDocumentJob = {
      organizationId: request.organizationId,
      documentId: request.documentId,
      textKey,
      goalId: request.goalId,
      sourceType: request.sourceType,
      version: request.version,
      ...(request.metadata === undefined ? {} : { metadata: request.metadata }),
    };

    await this.queue.publish(
      QueueName.EMBEDDING,
      job,
      // Keyed on the tenant *and* the document: two organizations re-indexing documents
      // that happen to share an id must not collapse into one job. `_`, never `:`.
      // ──
      // The text is in the key too, so a re-index with new words is a new job. In flight
      // only, never a job id: a kept job held it for an hour, and a resubmit was swallowed.
      {
        inFlightId: `${request.organizationId}_${JobKey.of(request.documentId, request.text)}`,
      },
    );
  }
}
