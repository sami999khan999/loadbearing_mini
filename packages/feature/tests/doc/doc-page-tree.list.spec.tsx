import type { ApiClient } from "@loadbearing/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocPageTreeList } from "../../src/doc/doc-page-tree.list.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const SPACE = "00000000-0000-7000-8000-0000000000f1" as never;
const node = (n: number, title: string) => ({
  id: `00000000-0000-7000-8000-00000000010${n}`,
  spaceId: SPACE,
  parentId: null,
  kind: "page",
  slug: title.toLowerCase(),
  title,
  icon: null,
  access: null,
  position: n,
  status: "draft",
  updatedAt: new Date("2026-09-01T00:00:00Z"),
});

const mount = async (move: ReturnType<typeof vi.fn>, remove = vi.fn().mockResolvedValue({})) => {
  const client = {
    docPage: {
      tree: () => Promise.resolve({ items: [node(1, "Intro"), node(2, "Setup")] }),
      move,
      remove,
    },
  } as unknown as ApiClient;
  await renderWithFakes(
    <DocPageTreeList
      spaceId={SPACE}
      editHref={(id) => `/edit/${id}`}
      renderLink={(href, content) => <a href={href}>{content}</a>}
    />,
    capabilitiesWith([]),
    undefined,
    ["doc", "common"],
    client,
  );
  return { remove };
};

describe("DocPageTreeList", () => {
  it("disables the moves while one is in flight", async () => {
    await mount(vi.fn(() => new Promise(() => undefined)));

    const down = await screen.findByRole("button", { name: "Move Intro down" });
    fireEvent.click(down);

    await waitFor(() => expect(down.hasAttribute("disabled")).toBe(true));
    for (const name of [
      "Move Setup up",
      "Move Setup under the one above",
      "Move Setup out one level",
    ]) {
      expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(true);
    }
  });

  it("renames the delete button while it asks, and puts it back on Escape and blur", async () => {
    await mount(vi.fn());

    const first = await screen.findByRole("button", { name: "Delete Intro" });
    fireEvent.click(first);
    const asking = screen.getByRole("button", { name: "Delete Intro and everything under it" });

    fireEvent.keyDown(asking, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Delete Intro" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Delete Intro" }));
    fireEvent.blur(screen.getByRole("button", { name: "Delete Intro and everything under it" }));
    expect(screen.getByRole("button", { name: "Delete Intro" })).toBeDefined();
  });

  it("moves focus to the page list after a delete", async () => {
    const { remove } = await mount(vi.fn());

    fireEvent.click(await screen.findByRole("button", { name: "Delete Intro" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Intro and everything under it" }));

    await waitFor(() => expect(remove).toHaveBeenCalled());
    const region = screen.getByRole("region", { name: "Pages" });
    await waitFor(() => expect(document.activeElement).toBe(region));
  });
});
