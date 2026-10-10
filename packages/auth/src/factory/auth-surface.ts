// Both, because the scheme differs by platform — shipping one produces an app that
// works for half your team. See docs/reference/auth-factory.md.
const DESKTOP_ORIGINS: readonly string[] = ["tauri://localhost", "http://tauri.localhost"];

// Which client opened a session, from its `Origin`, which ends at the host. Exact: a prefix
// let `http://tauri.localhost.example` pass as the desktop app.
export class AuthSurface {
  private constructor() {}

  public static of(origin: string | null | undefined): "web" | "desktop" {
    return origin && DESKTOP_ORIGINS.includes(origin) ? "desktop" : "web";
  }
}
