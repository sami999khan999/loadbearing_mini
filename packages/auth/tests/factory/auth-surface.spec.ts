import { describe, expect, it } from "vitest";
import { AuthSurface } from "../../src/factory/auth-surface.js";

describe("AuthSurface", () => {
  it("names both Tauri origins as the desktop app", () => {
    expect(AuthSurface.of("tauri://localhost")).toBe("desktop");
    expect(AuthSurface.of("http://tauri.localhost")).toBe("desktop");
  });

  // A prefix match passed any host that began with the Tauri one.
  it("treats a look-alike host as the web", () => {
    expect(AuthSurface.of("http://tauri.localhost.example")).toBe("web");
    expect(AuthSurface.of("tauri://localhost.example")).toBe("web");
  });

  it("treats a missing origin as the web", () => {
    expect(AuthSurface.of(null)).toBe("web");
    expect(AuthSurface.of(undefined)).toBe("web");
  });
});
