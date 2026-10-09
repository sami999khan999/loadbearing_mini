import { diffLines } from "../import.js";

export type DocDiffKind = "added" | "removed" | "same";

export interface DocDiffLine {
  readonly kind: DocDiffKind;
  readonly text: string;
  // The line's number on each side, null on the side it is absent from.
  readonly before: number | null;
  readonly after: number | null;
}

// A run shown as it is, or a run of unchanged lines folded behind one row. `at` is the
// fold's first line, which names it across renders.
export type DocDiffBlock =
  | { readonly kind: "lines"; readonly lines: readonly DocDiffLine[] }
  | { readonly kind: "fold"; readonly at: number; readonly lines: readonly DocDiffLine[] };

// Long enough for a page someone typed, short enough that a rewrite of a long one gives
// up rather than holding the main thread.
const TIMEOUT_MS = 1_000;

// A revision's Markdown against the draft, line by line. Stateless, so the dialog can
// memoise it and a spec can read it without rendering anything.
export class DocLineDiff {
  private constructor() {}

  // Null when the two texts are too far apart to diff inside the time bound.
  public static lines(before: string, after: string): DocDiffLine[] | null {
    const changes = diffLines(before, after, { timeout: TIMEOUT_MS });
    if (!changes) return null;
    const lines: DocDiffLine[] = [];
    let left = 1;
    let right = 1;
    for (const change of changes) {
      const kind: DocDiffKind = change.added ? "added" : change.removed ? "removed" : "same";
      for (const text of DocLineDiff.split(change.value)) {
        lines.push({
          kind,
          text,
          before: kind === "added" ? null : left++,
          after: kind === "removed" ? null : right++,
        });
      }
    }
    return lines;
  }

  public static changed(lines: readonly DocDiffLine[]): boolean {
    return lines.some((line) => line.kind !== "same");
  }

  // Keeps `context` unchanged lines either side of every change and folds the rest. A
  // single line is never folded: the row that hides it would be no shorter.
  public static blocks(lines: readonly DocDiffLine[], context: number): DocDiffBlock[] {
    const near = DocLineDiff.distances(lines);
    const blocks: DocDiffBlock[] = [];
    let index = 0;
    while (index < lines.length) {
      const start = index;
      const shown = (near[index] ?? 0) <= context;
      while (index < lines.length && (near[index] ?? 0) <= context === shown) index += 1;
      const run = lines.slice(start, index);
      if (shown || run.length < 2) {
        const last = blocks.at(-1);
        if (last?.kind === "lines") blocks[blocks.length - 1] = DocLineDiff.join(last, run);
        else blocks.push({ kind: "lines", lines: run });
      } else {
        blocks.push({ kind: "fold", at: start, lines: run });
      }
    }
    return blocks;
  }

  // Each line's distance to the nearest change, or Infinity when there is none.
  private static distances(lines: readonly DocDiffLine[]): number[] {
    const near = lines.map((line) => (line.kind === "same" ? Number.POSITIVE_INFINITY : 0));
    for (let i = 1; i < near.length; i += 1) {
      near[i] = Math.min(near[i] ?? 0, (near[i - 1] ?? 0) + 1);
    }
    for (let i = near.length - 2; i >= 0; i -= 1) {
      near[i] = Math.min(near[i] ?? 0, (near[i + 1] ?? 0) + 1);
    }
    return near;
  }

  private static join(
    block: { readonly lines: readonly DocDiffLine[] },
    run: readonly DocDiffLine[],
  ): DocDiffBlock {
    return { kind: "lines", lines: [...block.lines, ...run] };
  }

  // `diffLines` keeps each line's newline, so the last piece of a change is empty.
  private static split(value: string): string[] {
    const parts = value.split("\n");
    if (parts.at(-1) === "") parts.pop();
    return parts;
  }
}
