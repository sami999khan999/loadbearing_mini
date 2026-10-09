import { describe, expect, it } from "vitest";
import { DocNavCache } from "../../src/server/doc-nav-cache.js";

describe("DocNavCache", () => {
  it("shares the current version with an anonymous reader", () => {
    const out = DocNavCache.headers(new Headers(), true);
    expect(out["cache-control"]).toBe("public, max-age=31536000, immutable");
  });

  it.each(["cookie", "authorization", "x-api-key"])("keeps a %s request private", (name) => {
    const out = DocNavCache.headers(new Headers({ [name]: "x" }), true);
    expect(out["cache-control"]).toBe("private, max-age=300");
  });

  it("never stores a version the reader did not name", () => {
    expect(DocNavCache.headers(new Headers(), false)["cache-control"]).toBe("no-store");
  });

  it("varies on every credential header", () => {
    expect(DocNavCache.headers(new Headers(), true).vary).toBe("Cookie, Authorization, X-Api-Key");
  });
});
