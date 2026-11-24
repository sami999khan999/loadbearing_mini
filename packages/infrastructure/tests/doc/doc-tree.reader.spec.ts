import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DocSeedSpace, DocTreeReader } from "../../src/pg/seed/index.js";

// How the docs trees become spaces, run over a temporary repository, never the real one.

let root = "";
const write = (path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
// Quoted when YAML would read the title as something else, as the real docs do.
const page = (title: string, body = "", description = `About ${title}.`) =>
  `---\ntitle: ${title.startsWith("@") ? `"${title}"` : title}\ndescription: ${description}\n---\n\n# ${title}\n\n${body}\n`;
const meta = (pages: string[], title = "Folder") => JSON.stringify({ title, pages });

// One folder space with a nested folder, and one package with a reference section.
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

const read = (repo: string | null = "https://forge.test/team/kit") =>
  new DocTreeReader(root, repo, "dev").read();
// One space; a missing one fails the test rather than reading as undefined.
const space = (slug: string): DocSeedSpace => {
  const found = read().spaces.find((s) => s.slug === slug);
  if (!found) throw new Error(`no ${slug} space`);
  return found;
};
const entry = (from: DocSeedSpace, key: string) => from.pages.find((p) => p.key === key);
// The architecture page's Markdown once read, with `body` under its heading.
const rendered = (body: string, repo?: string | null) => {
  write("docs/explained/architecture.md", page("How it works", body));
  const found = read(repo).spaces.find((s) => s.slug === "explained");
  return entry(found as DocSeedSpace, "architecture")?.markdown.trimEnd();
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "doc-tree-"));
  scaffold();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("DocTreeReader — spaces", () => {
  it("skips a space whose tree is not in this repository", () => {
    expect(read().spaces.map((s) => s.slug)).toEqual(["overview", "explained", "packages"]);
  });

  it("reads a folder in meta.json order, its index as the first page", () => {
    const explained = space("explained");

    expect(explained.pages.map((p) => p.route)).toEqual([
      "overview",
      "architecture",
      "codebase",
      "codebase/core",
    ]);
    expect(entry(explained, "codebase/core")?.parentKey).toBe("codebase");
    expect(explained.description).toBe("About The guide.");
  });

  // Sections add no segment to a page's URL, which is the API's own path rule.
  it("makes a folder with no index.md a section that adds nothing to the route", () => {
    const packages = space("packages");

    expect(entry(packages, "core/reference")).toMatchObject({ kind: "section", route: null });
    expect(entry(packages, "core/reference/clock")?.route).toBe("core/clock");
  });

  it("gives a group space a generated first page, then one page per docs folder", () => {
    const packages = space("packages");

    expect(packages.pages[0]).toMatchObject({ key: "overview", parentKey: null, position: 0 });
    expect(packages.pages[0]?.title).toBe("Packages");
    expect(packages.pages[0]?.markdown).toContain(
      "| [@loadbearing/core](/doc/packages/core) | About @loadbearing/core. |",
    );
    expect(entry(packages, "core")).toMatchObject({ parentKey: null, position: 1 });
  });

  it("refuses a page meta.json leaves out, which would otherwise never be seeded", () => {
    write("docs/explained/orphan.md", page("Orphan"));

    expect(() => read()).toThrow(/orphan\.md is not in meta\.json/);
  });

  it("refuses a page meta.json names but the folder does not have", () => {
    write("docs/explained/meta.json", meta(["index", "architecture", "codebase", "gone"]));

    expect(() => read()).toThrow(/lists "gone", which is not there/);
  });

  it("lowercases a file name into a slug, and refuses one that cannot be a slug", () => {
    write("docs/explained/meta.json", meta(["index", "architecture", "codebase", "BACKLOG"]));
    write("docs/explained/BACKLOG.md", page("Backlog"));
    expect(entry(space("explained"), "backlog")).toBeDefined();

    write("docs/explained/meta.json", meta(["index", "architecture", "codebase", "Two_Words"]));
    write("docs/explained/Two_Words.md", page("Two words"));
    rmSync(join(root, "docs/explained/BACKLOG.md"));
    expect(() => read()).toThrow(/cannot be a page slug/);
  });

  it("drops the page's own H1, which the reader prints from the title", () => {
    expect(entry(space("explained"), "architecture")?.markdown).toBe("## Moving parts\n");
  });

  it("refuses a page with no title", () => {
    write("docs/explained/architecture.md", "# How it works\n");

    expect(() => read()).toThrow(/no title/);
  });

  it("cuts a long description at a word, inside the API's limit", () => {
    write("docs/explained/index.md", page("The guide", "", "word ".repeat(100).trim()));
    const description = space("explained").description ?? "";

    expect(description.length).toBeLessThanOrEqual(300);
    expect(description.endsWith("word…")).toBe(true);
  });
});

describe("DocTreeReader — links", () => {
  it("points a link to a seeded page at its route, keeping the anchor", () => {
    expect(rendered("[core](codebase/core.md#clock)")).toBe(
      "[core](/doc/explained/codebase/core#clock)",
    );
  });

  it("resolves a link across spaces, and a folder to its index page", () => {
    expect(rendered("[clock](../../packages/core/docs/reference/clock.md)")).toBe(
      "[clock](/doc/packages/core/clock)",
    );
    expect(rendered("[core](../../packages/core/docs/)")).toBe("[core](/doc/packages/core)");
  });

  it("points a link to any other repository file at the forge, on the branch", () => {
    expect(rendered("[`clock.ts`](../../packages/core/src/clock.ts)")).toBe(
      "[`clock.ts`](https://forge.test/team/kit/blob/dev/packages/core/src/clock.ts)",
    );
    expect(rendered("[src](../../packages/core/src)")).toBe(
      "[src](https://forge.test/team/kit/tree/dev/packages/core/src)",
    );
  });

  it("turns a link to another file into its text when there is no forge", () => {
    expect(rendered("[`clock.ts`](../../packages/core/src/clock.ts)", null)).toBe("`clock.ts`");
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
    for (const markdown of kept) expect(rendered(markdown)).toBe(markdown);
  });

  it("rewrites a link whose text is code", () => {
    expect(rendered("[`core.md`](codebase/core.md)")).toBe(
      "[`core.md`](/doc/explained/codebase/core)",
    );
  });

  it("turns a link to a missing file into its text and reports it", () => {
    write("docs/explained/architecture.md", page("How it works", "see [gone](gone.md)"));
    const reading = read();

    expect(entry(reading.spaces[1] as DocSeedSpace, "architecture")?.markdown).toBe("see gone\n");
    expect(reading.broken).toEqual(["docs/explained/architecture.md: gone.md"]);
  });
});
