// The response headers for `/api/doc-nav`. Immutable and shared only for the version the
// reader named and only when the request carried no credential of any kind.
export class DocNavCache {
  private constructor() {}

  public static headers(request: Headers, current: boolean): Record<string, string> {
    const shared =
      !request.has("cookie") && !request.has("authorization") && !request.has("x-api-key");
    return {
      "cache-control": !current
        ? "no-store"
        : shared
          ? "public, max-age=31536000, immutable"
          : "private, max-age=300",
      vary: "Cookie, Authorization, X-Api-Key",
    };
  }
}
