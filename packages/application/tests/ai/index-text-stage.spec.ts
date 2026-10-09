import { describe, expect, it } from "vitest";
import { IndexTextStage } from "../../src/ai/index-text-stage.js";
import { MapStorageGateway } from "./map-storage.gateway.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-26T00:00:00.000Z");

describe("IndexTextStage", () => {
  it("round-trips the text under a per-tenant key", async () => {
    const stage = new IndexTextStage(new MapStorageGateway());
    const key = await stage.stage("org1", "doc1", 5, "héllo");

    expect(key).toBe("embedding/org1/doc1/5.txt");
    expect(await stage.read(key)).toBe("héllo");
  });

  it("encodes a caller's id so a slash cannot add a segment", () => {
    expect(IndexTextStage.key("org1", "a/b", 5)).toBe("embedding/org1/a%2Fb/5.txt");
  });

  it("reads null once the object is released", async () => {
    const stage = new IndexTextStage(new MapStorageGateway());
    const key = await stage.stage("org1", "doc1", 5, "text");
    await stage.release(key);

    expect(await stage.read(key)).toBeNull();
  });

  it("sweeps only keys staged before the cutoff", async () => {
    const storage = new MapStorageGateway();
    const stage = new IndexTextStage(storage);
    await stage.stage("org1", "old", NOW - 8 * DAY, "x");
    await stage.stage("org2", "older", NOW - 9 * DAY, "x");
    const fresh = await stage.stage("org1", "new", NOW - DAY, "x");

    expect(await stage.sweepStale(new Date(NOW - 7 * DAY))).toBe(2);
    expect([...storage.objects.keys()]).toEqual([fresh]);
  });
});
