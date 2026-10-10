import { describe, expect, it } from "vitest";
import { SecurityHeaders } from "../../src/server/security-headers.js";

// `FC.13`. Nothing set any of these, behind cookie sessions and user-written Markdown.
describe("SecurityHeaders", () => {
  it("closes framing and sniffing on every response", () => {
    const response = SecurityHeaders.apply(new Response("x"), false);

    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("sends HSTS only when the app is served over https", () => {
    expect(
      SecurityHeaders.apply(new Response("x"), false).headers.has("strict-transport-security"),
    ).toBe(false);
    expect(
      SecurityHeaders.apply(new Response("x"), true).headers.get("strict-transport-security"),
    ).toBe("max-age=31536000");
  });

  it("keeps a header the route already set", () => {
    const response = new Response("x", { headers: { "referrer-policy": "no-referrer" } });
    expect(SecurityHeaders.apply(response, false).headers.get("referrer-policy")).toBe(
      "no-referrer",
    );
  });

  // `Response.redirect` has immutable headers; setting one throws.
  it("copies a redirect around its body rather than throwing", async () => {
    const redirect = Response.redirect("http://localhost/next", 302);
    const response = SecurityHeaders.apply(redirect, false);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost/next");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(await response.text()).toBe("");
  });
});
