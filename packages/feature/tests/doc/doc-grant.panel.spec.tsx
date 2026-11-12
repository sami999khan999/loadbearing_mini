import type { ApiClient } from "@loadbearing/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocGrantPanel } from "../../src/doc/doc-grant.panel.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

describe("DocGrantPanel", () => {
  it("names the grant on each Revoke button", async () => {
    const grant = (id: string, label: string) => ({
      id,
      kind: "organization",
      label,
      reason: "partner",
      expiresAt: null,
    });
    const client = {
      docGrant: {
        list: () => Promise.resolve({ items: [grant("g1", "Acme"), grant("g2", "Globex")] }),
      },
    } as unknown as ApiClient;
    await renderWithFakes(
      <DocGrantPanel spaceId={"00000000-0000-7000-8000-0000000000f1" as never} />,
      capabilitiesWith([]),
      undefined,
      ["doc", "common"],
      client,
    );

    expect(await screen.findByRole("button", { name: "Revoke access for Acme" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Revoke access for Globex" })).toBeDefined();
  });

  // `WK.5` and `WK.6`, found walking the panel: focus fell to the page after a revoke, and
  // nothing said Grant access waited on a reason.
  it("keeps focus in the panel after a revoke, and says target and reason are required", async () => {
    const client = {
      docGrant: {
        list: () =>
          Promise.resolve({
            items: [
              { id: "g1", kind: "organization", label: "Acme", reason: "p", expiresAt: null },
            ],
          }),
        revoke: vi.fn(() => Promise.resolve({ ok: true })),
      },
    } as unknown as ApiClient;
    await renderWithFakes(
      <DocGrantPanel spaceId={"00000000-0000-7000-8000-0000000000f1" as never} />,
      capabilitiesWith([]),
      undefined,
      ["doc", "common"],
      client,
    );

    expect(screen.getByLabelText("Reason").hasAttribute("required")).toBe(true);
    expect(screen.getByLabelText("Who").hasAttribute("required")).toBe(true);
    expect(screen.getByText(/^Required\./)).toBeDefined();

    fireEvent.click(await screen.findByRole("button", { name: "Revoke access for Acme" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Who can read it" })),
    );
  });
});
