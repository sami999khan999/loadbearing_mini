import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppLayout } from "../../../src/component/app-layout/app-layout.js";

// `WK.7`. The signed-in shell was a bare header; this is the frame it now sits in.
describe("AppLayout", () => {
  it("puts the sidebar beside a top bar and the page", () => {
    const { container } = render(
      <AppLayout sidebar={<aside aria-label="Menu" />} topbar={<button type="button">Bell</button>}>
        <main>Page</main>
      </AppLayout>,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root.firstElementChild?.getAttribute("aria-label")).toBe("Menu");
    expect(screen.getByRole("button", { name: "Bell" })).toBeDefined();
    expect(screen.getByRole("main").textContent).toBe("Page");
  });
});
