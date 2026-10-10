import { afterAll, describe, expect, inject, it } from "vitest";
import { S3StorageGateway, StorageKey } from "../../src/s3/index.js";
import type {} from "./support/stack.js";

const storage = new S3StorageGateway(inject("stack").storage);

const keys: string[] = [];

const probe = () => {
  const key = StorageKey.build("smoke", `probe-${Date.now()}.txt`, new Date());
  keys.push(key);
  return key;
};

afterAll(async () => {
  for (const key of keys) await storage.delete(key);
});

describe("S3StorageGateway against the running object store", () => {
  it("writes, reads back the same bytes, and reports the object gone once deleted", async () => {
    const key = probe();

    const stored = await storage.put(key, new TextEncoder().encode("hello"), "text/plain");

    expect(new TextDecoder().decode(await storage.get(key))).toBe("hello");
    expect(await storage.exists(key)).toBe(true);
    // The SHA-256 of "hello", so a checksum computed over the wrong bytes — or over the
    // encoded body rather than the payload — fails here rather than at a verification.
    expect(stored.checksum).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );

    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  // The two methods nothing else in the repository exercises: the browser uploads and
  // downloads directly, so a URL that is wrong is wrong in the browser and nowhere else.
  it("signs a download URL that fetches the object without credentials", async () => {
    const key = probe();
    await storage.put(key, new TextEncoder().encode("signed"), "text/plain");

    const url = await storage.presignDownload(key, 60);
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("signed");
  });

  const post = async (key: string, body: string, fields: Record<string, string> = {}) => {
    const signed = await storage.presignPost(key, "text/plain", 8, 60);
    const form = new FormData();
    for (const [name, value] of Object.entries({ ...signed.fields, ...fields })) {
      form.append(name, value);
    }
    form.append("file", new Blob([body], { type: "text/plain" }), "upload");
    return fetch(signed.url, { method: "POST", body: form });
  };

  it("signs an upload that accepts a POST within the length it was signed for", async () => {
    const key = probe();

    const response = await post(key, "uploaded");

    expect(response.ok).toBe(true);
    expect(new TextDecoder().decode(await storage.get(key))).toBe("uploaded");
  });

  it("refuses a body over the signed length, whatever the client declared", async () => {
    const key = probe();

    const response = await post(key, "nine bytes");

    expect(response.status).toBe(400);
    expect(await storage.exists(key)).toBe(false);
  });

  it("refuses a body whose content type is not the one signed", async () => {
    const key = probe();

    const response = await post(key, "small", { "Content-Type": "text/html" });

    expect(response.status).toBe(403);
    expect(await storage.exists(key)).toBe(false);
  });

  it("lists every key under a prefix across pages, and nothing outside it", async () => {
    const stem = `smoke/paged-${Date.now()}`;
    const inside = [1, 2, 3, 4, 5].map((n) => `${stem}/${n}.txt`);
    const outside = `${stem}x/other.txt`;
    keys.push(...inside, outside);
    for (const key of [...inside, outside]) {
      await storage.put(key, new Uint8Array([1]), "text/plain");
    }

    const pages: (readonly string[])[] = [];
    for await (const page of storage.listPages(`${stem}/`, 2)) pages.push(page);

    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
    expect(pages.flat()).toEqual(inside);
  });

  it("signs a URL that expires, and says so in the query it carries", async () => {
    const key = probe();

    const url = new URL(await storage.presignDownload(key, 60));

    expect(url.searchParams.get("X-Amz-Expires")).toBe("60");
    // Signed, not a bare object URL: a gateway that returned the plain path would pass
    // the fetch above against a public bucket and leak every object.
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
  });
});
