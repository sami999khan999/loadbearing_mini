import { type DocSpaceId, Identifiers } from "@loadbearing/contracts";
import { describe, expect, it } from "vitest";
import { DocImageKey } from "../../src/doc/doc-image-key.js";
import { DocImageOrphans } from "../../src/doc/doc-image-orphans.js";
import type { DocPageRepository } from "../../src/doc/doc-page.repository.js";
import type { StorageGateway } from "../../src/port/index.js";

const ORG = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const SPACE = Identifiers.docSpaceId.parse("018f8c00-0000-7000-8000-000000000030") as DocSpaceId;
const NOW = new Date("2026-03-01T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

// A version 7 id minted `ageMs` before `NOW`, so the key carries its own upload time.
const fileAged = (ageMs: number, n: number, type: "image/png" | "image/webp" = "image/png") => {
  const hex = (NOW.getTime() - ageMs).toString(16).padStart(12, "0");
  return DocImageKey.file(
    `${hex.slice(0, 8)}-${hex.slice(8)}-7000-8000-${String(n).padStart(12, "0")}`,
    type,
  );
};

const harness = (
  files: readonly string[],
  texts: readonly string[],
  extra: readonly string[] = [],
) => {
  const keys = new Set([
    ...files.map((file) => DocImageKey.key(ORG, SPACE, file)),
    ...extra.map((name) => `${DocImageKey.spacePrefix(ORG, SPACE)}${name}`),
  ]);
  const deleted: string[] = [];
  const pages = {
    listImageLinks: (_org: unknown, prefix: string) =>
      Promise.resolve(
        texts.flatMap((text) => text.match(new RegExp(`${prefix}[a-z]+/[0-9a-f-]{36}`, "g")) ?? []),
      ),
  } as unknown as DocPageRepository;
  const storage = {
    listPages: async function* (prefix: string, size = 2) {
      const all = [...keys].filter((key) => key.startsWith(prefix)).sort();
      for (let at = 0; at < all.length; at += size) yield all.slice(at, at + size);
    },
    delete: (key: string) => {
      keys.delete(key);
      deleted.push(key);
      return Promise.resolve();
    },
  } as unknown as StorageGateway;
  return { orphans: new DocImageOrphans(pages, storage, { now: () => NOW }), deleted, keys };
};

const link = (file: string) => DocImageKey.url(ORG, SPACE, file);

describe("DocImageOrphans", () => {
  const linked = fileAged(5 * HOUR, 1);
  const lost = fileAged(5 * HOUR, 2, "image/webp");
  const young = fileAged(HOUR / 2, 3);

  it("deletes what no text links and keeps what any text does, across pages of keys", async () => {
    const { orphans, deleted } = harness(
      [linked, lost, young, fileAged(9 * HOUR, 4), fileAged(9 * HOUR, 5)],
      [`![a](${link(linked)})`],
    );

    expect(await orphans.run(ORG, SPACE)).toBe(3);
    expect(deleted.map((key) => key.split("/").pop()).sort()).toEqual(
      [lost, fileAged(9 * HOUR, 4), fileAged(9 * HOUR, 5)].sort(),
    );
  });

  it("keeps an image younger than an hour even though nothing links it yet", async () => {
    const { orphans, keys } = harness([young], []);

    expect(await orphans.run(ORG, SPACE)).toBe(0);
    expect(keys.has(DocImageKey.key(ORG, SPACE, young))).toBe(true);
  });

  it("keeps an image linked only by a draft, a published text or a revision alike", async () => {
    const { orphans } = harness([linked], [`see ${link(linked)} here`, "nothing"]);

    expect(await orphans.run(ORG, SPACE)).toBe(0);
  });

  it("leaves alone a key it would not have written", async () => {
    const { orphans, deleted } = harness([], [], ["notes.txt", "../escape.png"]);

    expect(await orphans.run(ORG, SPACE)).toBe(0);
    expect(deleted).toEqual([]);
  });

  it("reads an upload's time off its id, and nothing off a name that has none", () => {
    expect(DocImageKey.uploadedAt(fileAged(HOUR, 1))?.getTime()).toBe(NOW.getTime() - HOUR);
    expect(DocImageKey.uploadedAt("not-a-uuid.png")).toBeNull();
    expect(DocImageKey.uploadedAt("018f8c00-0000-4000-8000-000000000001.png")).toBeNull();
  });
});
