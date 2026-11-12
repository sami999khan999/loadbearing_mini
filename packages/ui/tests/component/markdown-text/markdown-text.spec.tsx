import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "../../../src/component/markdown-text/markdown-text.js";

describe("MarkdownText", () => {
  it("renders Markdown, tables included, inside the prose styles", () => {
    const { container } = render(
      <MarkdownText
        text={"**Bold** and a list:\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |"}
      />,
    );

    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("table")).not.toBeNull();
    expect(container.firstElementChild?.className).toContain("ui-prose");
  });

  // An answer is untrusted text: a model can be asked to echo anything a source said.
  it("never renders raw HTML or a script link", () => {
    const { container } = render(
      <MarkdownText
        text={'<img src="x" onerror="alert(1)"><script>alert(2)</script>[go](javascript:alert(3))'}
      />,
    );

    expect(container.querySelector("img, script")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.querySelector("a")?.getAttribute("href") ?? "").not.toContain("javascript");
  });

  it("renders a half-written answer without throwing", () => {
    render(<MarkdownText text={"Here is **half a bold and a `code"} />);

    expect(screen.getByText(/Here is/)).toBeDefined();
  });
});
