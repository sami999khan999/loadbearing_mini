import { z } from "../import.js";
import { Identifiers } from "../primitive/index.js";

// What changed in a tenant's published Docs, for the subscribers that keep a copy of it.
// Ids only: a subscriber reads the page it needs, so a payload never holds stale text.
export const docEvents = {
  "doc.page.published": z.object({
    spaceId: Identifiers.docSpaceId,
    pageId: Identifiers.docPageId,
    revisionNo: z.number().int().positive(),
  }),
  // The whole subtree, because a delete takes every page under the one named.
  "doc.page.deleted": z.object({
    spaceId: Identifiers.docSpaceId,
    pageIds: z.array(Identifiers.docPageId),
  }),
  // Every page the space held, read before the delete: afterwards nothing can list them.
  "doc.space.deleted": z.object({
    spaceId: Identifiers.docSpaceId,
    pageIds: z.array(Identifiers.docPageId),
  }),
} as const;
