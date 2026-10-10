// Both, because the scheme differs by platform — shipping one produces an app that
// works for half your team. See docs/reference/auth-factory.md.
const DESKTOP_ORIGINS: readonly string[] = ["tauri://localhost", "http://tauri.localhost"];

// Which client a session was opened from, pinned on the session row. An `Origin` header is
// the whole origin and nothing after it, so the match is exact: a prefix let
// `http://tauri.localhost.example` pass as the desktop app.
export class AuthSurface {
  private constructor() {}

  public static of(origin: string | null | undefined): "web" | "desktop" {
    return origin && DESKTOP_ORIGINS.includes(origin) ? "desktop" : "web";
  }
}
