// How the docs trees become spaces: the page order, which folders are pages and which are
// sections, and which links are rewritten. Run over a temporary repository, never the real one.

// @ts-check

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clip, readSpaces, renderSpace, rewriteLinks, routeTable } from "../docs-tree.mjs";

let root = "";
const write = (path, text) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
// Quoted when YAML would read the title as something else, as the real docs do.
const page = (title, body = "", description = `About ${title}.`) =>
  `---\ntitle: ${title.startsWith("@") ? `"${title}"` : title}\ndescription: ${description}\n---\n\n# ${title}\n\n${body}\n`;
const meta = (pages, title = "Folder") => JSON.stringify({ title, pages });

// A small repository: one folder space with a nested folder, and one package with a
// reference section.
const scaffold = () => {
  write("docs/index.md", page("Documentation", "[Explained](explained/index.md)"));
  write("docs/explained/meta.json", meta(["index", "architecture", "codebase"]));
  write("docs/explained/index.md", page("The guide"));
  write("docs/explained/architecture.md", page("How it works", "## Moving parts"));
  write("docs/explained/codebase/meta.json", meta(["index", "core"]));
  write("docs/explained/codebase/index.md", page("The codebase"));
  write("docs/explained/codebase/core.md", page("Core"));
  write("packages/core/docs/meta.json", meta(["index", "reference"]));
  write("packages/core/docs/index.md", page("@loadbearing/core"));
  write("packages/core/docs/reference/meta.json", meta(["clock"], "Reference"));
  write("packages/core/docs/reference/clock.md", page("Clock"));
  write("packages/core/src/clock.ts", "export class Clock {}\n");
};

const context = (spaces, repo = "https://forge.test/team/kit") => ({
  routes: routeTable(spaces, "/doc"),
  repoRoot: root,
  repo,
  branch: "dev",
  broken: [],
  docRoot: "/doc",
});
// One space, read on its own; a missing one fails the test rather than reading as undefined.
const only = (slug) => {
  const space = readSpaces(root, [slug])[0];
  if (!space) throw new Error(`no ${slug} space`);
  return space;
};
const entry = (space, key) => space.entries.find((e) => e.key === key);

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "docs-tree-"));
  scaffold();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("readSpaces", () => {
  it("skips a space whose tree is not in this repository", () => {
    expect(readSpaces(root).map((s) => s.slug)).toEqual(["overview", "explained", "packages"]);
  });

  it("publishes a folder in meta.json order, its index as the first page", () => {
    const space = only("explained");

    expect(space.entries.map((e) => e.route)).toEqual([
      "overview",
      "architecture",
      "codebase",
      "codebase/core",
    ]);
    expect(entry(space, "codebase/core").parentKey).toBe("codebase");
    expect(space.description).toBe("About The guide.");
  });

  // Sections add no segment to a page's URL, which is the API's own path rule.
  it("makes a folder with no index.md a section that adds nothing to the route", () => {
    const space = only("packages");

    expect(entry(space, "core/reference")).toMatchObject({ kind: "section", route: null });
    expect(entry(space, "core/reference/clock").route).toBe("core/clock");
  });

  it("gives a group space a generated first page, then one page per docs folder", () => {
    const space = only("packages");

    expect(space.entries[0]).toMatchObject({
      key: "overview",
      file: null,
      parentKey: null,
      position: 0,
    });
    expect(entry(space, "core")).toMatchObject({ parentKey: null, position: 1 });
    expect(entry(space, "core").file).toBe(join(root, "packages/core/docs/index.md"));
  });

  it("refuses a page meta.json leaves out, which would otherwise never publish", () => {
    write("docs/explained/orphan.md", page("Orphan"));

    expect(() => readSpaces(root)).toThrow(/orphan\.md is not in meta\.json/);
  });

  it("refuses a page meta.json names but the folder does not have", () => {
    write("docs/explained/meta.json", meta(["index", "architecture", "codebase", "gone"]));

    expect(() => readSpaces(root)).toThrow(/lists "gone", which is not there/);
  });

  it("lowercases a file name into a slug, and refuses one that cannot be a slug", () => {
    write("docs/explained/meta.json", meta(["index", "architecture", "codebase", "BACKLOG"]));
    write("docs/explained/BACKLOG.md", page("Backlog"));
    expect(entry(only("explained"), "backlog")).toBeDefined();

    write("docs/explained/meta.json", meta(["index", "architecture", "codebase", "Two_Words"]));
    write("docs/explained/Two_Words.md", page("Two words"));
    rmSync(join(root, "docs/explained/BACKLOG.md"));
    expect(() => readSpaces(root)).toThrow(/cannot be a page slug/);
  });
});

describe("rewriteLinks", () => {
  const from = () => join(root, "docs/explained/architecture.md");
  const rewrite = (markdown, repo = undefined) => {
    const spaces = readSpaces(root);
    return rewriteLinks(markdown, from(), context(spaces, repo));
  };

  it("points a link to a published page at its route, keeping the anchor", () => {
    expect(rewrite("[core](codebase/core.md#clock)")).toBe(
      "[core](/doc/explained/codebase/core#clock)",
    );
  });

  it("resolves a link across spaces, and a folder to its index page", () => {
    expect(rewrite("[clock](../../packages/core/docs/reference/clock.md)")).toBe(
      "[clock](/doc/packages/core/clock)",
    );
    expect(rewrite("[core](../../packages/core/docs/)")).toBe("[core](/doc/packages/core)");
  });

  it("points a link to any other repository file at the forge, on the branch", () => {
    expect(rewrite("[`clock.ts`](../../packages/core/src/clock.ts)")).toBe(
      "[`clock.ts`](https://forge.test/team/kit/blob/dev/packages/core/src/clock.ts)",
    );
    expect(rewrite("[src](../../packages/core/src)")).toBe(
      "[src](https://forge.test/team/kit/tree/dev/packages/core/src)",
    );
  });

  it("leaves absolute links, anchors, images and code as written", () => {
    const kept = [
      "[web](https://example.test/a.md)",
      "[top](#moving-parts)",
      "[root](/doc/explained)",
      "![diagram](codebase/core.md)",
      "`[core](codebase/core.md)`",
      "```md\n[core](codebase/core.md)\n```",
      "~~~\n[core](codebase/core.md)\n```\nstill code\n~~~",
    ];
    for (const markdown of kept) expect(rewrite(markdown)).toBe(markdown);
  });

  it("rewrites a link whose text is code", () => {
    expect(rewrite("[`core.md`](codebase/core.md)")).toBe(
      "[`core.md`](/doc/explained/codebase/core)",
    );
  });

  it("turns a link to a missing file into its text and reports it", () => {
    const spaces = readSpaces(root);
    const ctx = context(spaces);

    expect(rewriteLinks("see [gone](gone.md)", from(), ctx)).toBe("see gone");
    expect(ctx.broken).toEqual(["docs/explained/architecture.md: gone.md"]);
  });
});

describe("renderSpace", () => {
  it("drops the page's own H1, which the reader prints from the title", () => {
    const space = only("explained");
    const pages = renderSpace(space, context(readSpaces(root)));

    expect(pages.find((p) => p.key === "architecture")?.markdown).toBe("## Moving parts\n");
  });

  it("writes a group's first page as a table of its docs folders", () => {
    const space = only("packages");
    const [overview] = renderSpace(space, context(readSpaces(root)));

    expect(overview.title).toBe("Packages");
    expect(overview.markdown).toContain(
      "| [@loadbearing/core](/doc/packages/core) | About @loadbearing/core. |",
    );
  });

  it("refuses a page with no title", () => {
    write("docs/explained/architecture.md", "# How it works\n");
    const space = only("explained");

    expect(() => renderSpace(space, context(readSpaces(root)))).toThrow(/no title/);
  });
});

describe("clip", () => {
  it("cuts a long description at a word, inside the limit", () => {
    const cut = clip("one two three four", 12);

    expect(cut).toBe("one two…");
    expect(cut?.length).toBeLessThanOrEqual(12);
    expect(clip("short", 12)).toBe("short");
  });
});
