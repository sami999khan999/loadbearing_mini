import type { Principal } from "../primitive/index.js";
import type { IndexDocumentResult, IndexDocumentUseCase } from "./index-document.use-case.js";
import type { IndexTextStage } from "./index-text-stage.js";
import type { IndexDocumentJob } from "./queue-document-index.use-case.js";

// The embedding consumer's unit of work: the staged text out of the bucket, the index,
// then the object deleted. A throw leaves it, so a retry or `queue:replay` still reads it.
export class IndexQueuedDocumentUseCase {
  public constructor(
    private readonly index: IndexDocumentUseCase,
    private readonly stage: IndexTextStage,
  ) {}

  public async execute(actor: Principal, job: IndexDocumentJob): Promise<IndexDocumentResult> {
    // Both shapes for one release: a job queued before the move carries `text` inline.
    const text = job.textKey === undefined ? (job.text ?? "") : await this.stage.read(job.textKey);

    // Gone means this job already ran and released it, or a sweep or purge took it. A
    // retry would find it gone every time, so there is nothing left to do.
    if (text === null) return { documentId: job.documentId, chunks: 0 };

    const result = await this.index.execute(actor, {
      documentId: job.documentId,
      text,
      goalId: job.goalId ?? null,
      sourceType: job.sourceType ?? "document",
      ...(job.version === undefined ? {} : { version: job.version }),
    });

    if (job.textKey !== undefined) await this.stage.release(job.textKey);
    return result;
  }
}
