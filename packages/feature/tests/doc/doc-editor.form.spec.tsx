import type { ApiClient } from "@loadbearing/api-client";
import type { DocPageDraftDto } from "@loadbearing/contracts";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocEditorForm } from "../../src/doc/doc-editor.form.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const draft = {
  id: "00000000-0000-7000-8000-0000000000e1",
  spaceId: "00000000-0000-7000-8000-0000000000f1",
  parentId: null,
  kind: "page",
  slug: "intro",
  title: "Intro",
  icon: null,
  access: null,
  position: 0,
  status: "draft",
  updatedAt: new Date("2026-09-01T00:00:00Z"),
  description: null,
  markdown: "hello",
  url: null,
  draftVersion: 1,
  revisionNo: 0,
  publishedAt: null,
} as unknown as DocPageDraftDto;

const mount = (onDirtyChange?: (dirty: boolean) => void) =>
  renderWithFakes(
    <DocEditorForm draft={draft} onDirtyChange={onDirtyChange} />,
    capabilitiesWith([]),
    undefined,
    ["doc", "common"],
    { docPage: { preview: vi.fn(() => Promise.resolve({ html: "" })) } } as unknown as ApiClient,
  );

describe("DocEditorForm", () => {
  it("offers Write and Preview as pressed toggles, not tabs", async () => {
    await mount();

    const group = await screen.findByRole("group", { name: "Editor mode" });
    expect(group.querySelector("[role=tab]")).toBeNull();
    const write = screen.getByRole("button", { name: "Write" });
    const preview = screen.getByRole("button", { name: "Preview" });
    expect(write.getAttribute("aria-pressed")).toBe("true");
    expect(preview.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(preview);
    expect(preview.getAttribute("aria-pressed")).toBe("true");
    expect(write.getAttribute("aria-pressed")).toBe("false");
  });

  it("opens the image picker from a real button outside the toggle group", async () => {
    const { container } = await mount();

    const insert = await screen.findByRole("button", { name: "Insert image" });
    expect(screen.getByRole("group", { name: "Editor mode" }).contains(insert)).toBe(false);
    const picker = container.querySelector("input[type=file]") as HTMLInputElement;
    const click = vi.spyOn(picker, "click");
    fireEvent.click(insert);
    expect(click).toHaveBeenCalled();
  });

  // `RW.1`. The shell holds navigation on this, since autosave waits two seconds.
  it("reports unsaved edits as soon as a key lands", async () => {
    const onDirtyChange = vi.fn();
    await mount(onDirtyChange);

    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(await screen.findByLabelText("Title"), { target: { value: "Intro 2" } });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
