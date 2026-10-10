// Set on every response the web server sends: pages, server functions and `/api/*`.
// A header the handler already chose is kept, so a route can still say otherwise.
export class SecurityHeaders {
  private constructor() {}

  // No `script-src`: Start inlines its hydration scripts, and a policy without a nonce
  // for them would blank every page. What is here breaks nothing and closes framing.
  private static readonly POLICY = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'";

  // A year, on the origin only: `includeSubDomains` would bind hosts this app does not own.
  private static readonly HSTS = "max-age=31536000";

  public static of(secure: boolean): ReadonlyMap<string, string> {
    const headers = new Map<string, string>([
      ["content-security-policy", SecurityHeaders.POLICY],
      ["x-content-type-options", "nosniff"],
      ["x-frame-options", "DENY"],
      ["referrer-policy", "strict-origin-when-cross-origin"],
    ]);
    // Only over https: sent over http, a browser ignores it, and a dev host that later
    // gains a certificate would be pinned to it for a year.
    if (secure) headers.set("strict-transport-security", SecurityHeaders.HSTS);
    return headers;
  }

  // The same response when its headers can be changed. A redirect's, and a fetched one's,
  // cannot, so those are copied around the same body.
  public static apply(response: Response, secure: boolean): Response {
    const missing = [...SecurityHeaders.of(secure)].filter(([name]) => !response.headers.has(name));
    if (missing.length === 0) return response;
    try {
      for (const [name, value] of missing) response.headers.set(name, value);
      return response;
    } catch {
      const headers = new Headers(response.headers);
      for (const [name, value] of missing) headers.set(name, value);
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }
  }
}
