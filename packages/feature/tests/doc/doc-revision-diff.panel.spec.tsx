import type { ApiClient } from "@loadbearing/api-client";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocLineDiff } from "../../src/doc/doc-line-diff.js";
import { DocRevisionList } from "../../src/doc/doc-revision.list.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const PAGE = "00000000-0000-7000-8000-0000000000e1" as never;

const numbered = (count: number, mark: string) =>
  Array.from({ length: count }, (_, i) => `line ${i + 1}${i + 1 === count ? mark : ""}`).join("\n");

describe("DocLineDiff", () => {
  it("numbers each side and tags added and removed lines", () => {
    const lines = DocLineDiff.lines("a\nb\nc", "a\nB\nc");

    expect(lines?.map((line) => [line.kind, line.text, line.before, line.after])).toEqual([
      ["same", "a", 1, 1],
      ["removed", "b", 2, null],
      ["added", "B", null, 2],
      ["same", "c", 3, 3],
    ]);
  });

  it("folds a long unchanged run to the context either side of a change", () => {
    const lines = DocLineDiff.lines(numbered(30, ""), numbered(30, "!")) ?? [];
    const blocks = DocLineDiff.blocks(lines, 3);

    expect(blocks.map((block) => block.kind)).toEqual(["fold", "lines"]);
    const fold = blocks[0];
    expect(fold?.lines).toHaveLength(26);
  });

  it("reports identical texts as unchanged", () => {
    expect(DocLineDiff.changed(DocLineDiff.lines("x\ny", "x\ny") ?? [])).toBe(false);
  });
});

describe("DocRevisionList compare", () => {
  const client = (revision: ReturnType<typeof vi.fn>) =>
    ({
      docPage: {
        revisions: () =>
          Promise.resolve({
            items: [{ revisionNo: 2, title: "Intro", createdAt: new Date("2026-09-03T00:00:00Z") }],
          }),
        revision,
      },
    }) as unknown as ApiClient;

  it("fetches the revision only when Compare is pressed, then shows the changed lines", async () => {
    const revision = vi.fn(() => Promise.resolve({ markdown: "one\ntwo" }));
    await renderWithFakes(
      <DocRevisionList
        pageId={PAGE}
        draftVersion={1}
        draftMarkdown={"one\nthree"}
        onRestored={() => undefined}
      />,
      capabilitiesWith([]),
      undefined,
      ["doc", "common"],
      client(revision),
    );

    const compare = await screen.findByRole("button", { name: "Compare" });
    expect(revision).not.toHaveBeenCalled();
    fireEvent.click(compare);

    await waitFor(() => expect(screen.getByText("three")).toBeDefined());
    expect(revision).toHaveBeenCalledTimes(1);
    expect(screen.getByText("two")).toBeDefined();
  });
});
