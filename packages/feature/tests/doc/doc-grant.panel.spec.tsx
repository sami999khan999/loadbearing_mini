import type { ApiClient } from "@loadbearing/api-client";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
