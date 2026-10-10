import type { ApiClient } from "@loadbearing/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocOrphanedSpaceList } from "../../src/doc/doc-orphaned-space.list.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const SPACE = "00000000-0000-7000-8000-0000000000f1";

const mount = (remove: ReturnType<typeof vi.fn>, items = [{ id: SPACE, slug: "notes" }]) =>
  renderWithFakes(
    <DocOrphanedSpaceList />,
    capabilitiesWith(["doc.space.manage"]),
    undefined,
    ["doc", "common"],
    {
      docSpace: { orphans: () => Promise.resolve({ items }), remove },
    } as unknown as ApiClient,
  );

// `BL.15`. A departed author's private space, shown by slug, deleted on a second press.
describe("DocOrphanedSpaceList", () => {
  it("deletes a space only on the second press", async () => {
    const remove = vi.fn(() => Promise.resolve({ ok: true }));
    await mount(remove);

    fireEvent.click(await screen.findByRole("button", { name: "Delete the private space notes" }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirm: delete the private space notes and every page in it",
      }),
    );

    await waitFor(() => expect(remove).toHaveBeenCalledWith({ spaceId: SPACE }));
  });

  it("renders nothing when no author has left", async () => {
    const { container } = await mount(vi.fn(), []);
    expect(container.querySelector("section")).toBeNull();
  });
});
