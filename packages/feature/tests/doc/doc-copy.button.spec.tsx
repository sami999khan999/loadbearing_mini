import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocCopyButton } from "../../src/doc/doc-copy.button.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const mount = () =>
  renderWithFakes(<DocCopyButton markdown="# Hi" />, capabilitiesWith([]), undefined, ["doc"]);

describe("DocCopyButton", () => {
  it("copies the Markdown and says so", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Markdown" }));
    });

    expect(writeText).toHaveBeenCalledWith("# Hi");
    expect(screen.getByRole("button", { name: "Copied" })).toBeDefined();
  });

  // An insecure origin has no clipboard at all; calling into it used to throw.
  it("reports a failure when there is no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Markdown" }));
    });

    expect(screen.getByRole("button", { name: "Copy failed" })).toBeDefined();
  });

  it("reports a failure when the write is refused", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    await mount();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy Markdown" }));
    });

    expect(screen.getByRole("button", { name: "Copy failed" })).toBeDefined();
  });
});
