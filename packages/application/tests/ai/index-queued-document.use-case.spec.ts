import { Identifiers } from "@loadbearing/contracts";
import { CapabilitySet } from "@loadbearing/permissions";
import { describe, expect, it, vi } from "vitest";
import type { IndexDocumentUseCase } from "../../src/ai/index-document.use-case.js";
import { IndexQueuedDocumentUseCase } from "../../src/ai/index-queued-document.use-case.js";
import { IndexTextStage } from "../../src/ai/index-text-stage.js";
import { Principal } from "../../src/primitive/principal.js";
import { MapStorageGateway } from "./map-storage.gateway.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const DOCUMENT = "018f8c00-0000-7000-8000-0000000000d1";
const actor = new Principal(
  ORG,
  Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011"),
  CapabilitySet.from({ wildcard: true, org: { grants: [], denies: [] }, goals: {} }),
);

const build = (execute = vi.fn().mockResolvedValue({ documentId: DOCUMENT, chunks: 2 })) => {
  const storage = new MapStorageGateway();
  const stage = new IndexTextStage(storage);
  const index = { execute } as unknown as IndexDocumentUseCase;
  return { storage, stage, execute, useCase: new IndexQueuedDocumentUseCase(index, stage) };
};

describe("IndexQueuedDocumentUseCase", () => {
  it("indexes the staged text, then deletes the object", async () => {
    const { storage, stage, execute, useCase } = build();
    const textKey = await stage.stage(ORG, DOCUMENT, 7, "the body");

    await useCase.execute(actor, {
      organizationId: ORG,
      documentId: DOCUMENT,
      textKey,
      version: 7,
    });

    expect(execute).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ documentId: DOCUMENT, text: "the body", version: 7 }),
    );
    expect(storage.objects.size).toBe(0);
  });

  it("leaves the object when indexing throws, so a replay can read it", async () => {
    const { storage, stage, useCase } = build(vi.fn().mockRejectedValue(new Error("boom")));
    const textKey = await stage.stage(ORG, DOCUMENT, 7, "the body");

    await expect(
      useCase.execute(actor, { organizationId: ORG, documentId: DOCUMENT, textKey, version: 7 }),
    ).rejects.toThrow("boom");
    expect(storage.objects.has(textKey)).toBe(true);
  });

  it("does nothing when the object is already gone", async () => {
    const { execute, useCase } = build();

    const result = await useCase.execute(actor, {
      organizationId: ORG,
      documentId: DOCUMENT,
      textKey: `embedding/${ORG}/${DOCUMENT}/7.txt`,
    });

    expect(result.chunks).toBe(0);
    expect(execute).not.toHaveBeenCalled();
  });

  // One release: a job queued before the text moved to the bucket still holds it inline.
  it("still indexes a job that carries its text inline", async () => {
    const { execute, useCase } = build();

    await useCase.execute(actor, { organizationId: ORG, documentId: DOCUMENT, text: "inline" });

    expect(execute).toHaveBeenCalledWith(actor, expect.objectContaining({ text: "inline" }));
  });
});
