import type { ApiClient } from "@loadbearing/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TenantExportPanel } from "../../src/platform/tenant-export.panel.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const TENANT = "00000000-0000-7000-8000-0000000000b1";
const DAY = "2026-08-15";

const mount = (listExportImages: ReturnType<typeof vi.fn>) =>
  renderWithFakes(<TenantExportPanel />, capabilitiesWith([]), undefined, ["platform", "common"], {
    platform: {
      listExports: () =>
        Promise.resolve([
          { key: `export/${TENANT}/${DAY}/manifest.json`, day: DAY, url: "https://s3/m" },
        ]),
      listExportImages,
    },
  } as unknown as ApiClient);

afterEach(() => {
  vi.restoreAllMocks();
});

// `RW.4`. The list leaves the copied images out, so each export day saves them as a file.
describe("TenantExportPanel", () => {
  it("saves one export day's doc images as a file of paths and links", async () => {
    const listExportImages = vi.fn(() =>
      Promise.resolve([{ path: "doc-image/s/a.png", url: "https://s3/a" }]),
    );
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      return "blob:links";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await mount(listExportImages);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: TENANT } });
    fireEvent.click(await screen.findByRole("button", { name: `Save doc image links for ${DAY}` }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(listExportImages).toHaveBeenCalledWith({ organizationId: TENANT, day: DAY });
    expect(await created[0]?.text()).toBe("doc-image/s/a.png\thttps://s3/a\n");
  });

  it("says so when the export holds no images, and saves nothing", async () => {
    URL.createObjectURL = vi.fn(() => "blob:links");
    await mount(vi.fn(() => Promise.resolve([])));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: TENANT } });
    fireEvent.click(await screen.findByRole("button", { name: `Save doc image links for ${DAY}` }));

    expect(await screen.findByText("That export holds no doc images.")).toBeDefined();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
