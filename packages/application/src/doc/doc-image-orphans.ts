import type { DocSpaceId, OrganizationId } from "../import.js";
import type { StorageGateway } from "../port/index.js";
import { DocImageKey } from "./doc-image-key.js";
import type { DocPageRepository } from "./doc-page.repository.js";

// Deletes the images of one space that no text links any more. A page's delete leaves its
// images because another page may link them; this is the pass that decides, later.
export class DocImageOrphans {
  // An upload is signed before the text that links it is saved. Younger than this, an
  // image may belong to a draft nobody has saved yet, so it is never touched.
  public static readonly GRACE_MS = 60 * 60 * 1000;

  public constructor(
    private readonly pages: DocPageRepository,
    private readonly storage: StorageGateway,
    private readonly clock: { now(): Date },
  ) {}

  // Returns how many objects went. The references are read before the listing, so an
  // image uploaded in between is young and skipped rather than judged on a stale read.
  public async run(organizationId: OrganizationId, spaceId: DocSpaceId): Promise<number> {
    const linked = new Set(
      (
        await this.pages.listImageLinks(
          organizationId,
          spaceId,
          DocImageKey.urlPrefix(organizationId, spaceId),
        )
      ).map((link) => DocImageKey.fileOfLink(link)),
    );
    const prefix = DocImageKey.spacePrefix(organizationId, spaceId);
    const cutoff = this.clock.now().getTime() - DocImageOrphans.GRACE_MS;

    let deleted = 0;
    for await (const keys of this.storage.listPages(prefix)) {
      for (const key of keys) {
        const file = key.slice(prefix.length);
        // A key this class would not have written is not this class's to delete.
        if (DocImageKey.typeOf(file) === null || linked.has(file)) continue;
        const uploadedAt = DocImageKey.uploadedAt(file);
        if (uploadedAt === null || uploadedAt.getTime() > cutoff) continue;
        await this.storage.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }
}
