import type { ApiClient } from "@loadbearing/api-client";
import type { DocPageDraftDto } from "@loadbearing/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

const IMAGE_URL = "/api/doc-image/org/space/png/image";

const mount = (onDirtyChange?: (dirty: boolean) => void, markdown = "hello") =>
  renderWithFakes(
    <DocEditorForm draft={{ ...draft, markdown }} onDirtyChange={onDirtyChange} />,
    capabilitiesWith([]),
    undefined,
    ["doc", "common"],
    {
      docPage: {
        preview: vi.fn(() => Promise.resolve({ html: "" })),
        upload: vi.fn(() =>
          Promise.resolve({ url: IMAGE_URL, post: { url: "http://storage.test/", fields: {} } }),
        ),
      },
    } as unknown as ApiClient,
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

  // Found walking the editor: the caret sits at 0 after Preview, and the image landed
  // in front of `# Welcome`, so the heading rendered as a paragraph.
  it("inserts an uploaded image on its own lines, never glued to the block at the caret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    );
    const { container } = await mount(undefined, "# Welcome\n\nBody.");
    const textarea = (await screen.findByLabelText("Content")) as HTMLTextAreaElement;
    textarea.setSelectionRange(0, 0);

    const picker = container.querySelector("input[type=file]") as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
    fireEvent.change(picker, { target: { files: [file] } });

    await waitFor(() => expect(textarea.value).toBe(`![shot](${IMAGE_URL})\n\n# Welcome\n\nBody.`));
    vi.unstubAllGlobals();
  });
});
