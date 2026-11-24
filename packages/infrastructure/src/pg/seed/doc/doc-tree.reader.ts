import {
  dirname,
  execSync,
  existsSync,
  join,
  posix,
  readdirSync,
  readFileSync,
  relative,
  resolve,
  sep,
  statSync,
} from "../../../import.js";

// The API's own limits (`DocSpaceContract`, `DocPageContract`), checked while reading so a
// bad page fails the seed before any space is touched.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 60;
const TITLE_MAX = 160;
const DESCRIPTION_MAX = 300;
const MARKDOWN_MAX = 200_000;

// The seeded spaces are platform staff's (`members`), and those read at `/doc`.
const DOC_ROOT = "/doc";

interface SpaceSpec {
  readonly slug: string;
  readonly title: string;
  readonly icon: string;
  readonly file?: string;
  readonly folder?: string;
  readonly extra?: readonly { slug: string; title: string; folder: string }[];
  readonly group?: string;
  readonly order?: readonly string[];
  readonly description?: string;
  readonly intro?: readonly string[];
}

interface Entry {
  readonly kind: "page" | "section";
  // Null for a group space's generated overview, which no file holds.
  readonly file: string | null;
  readonly slug: string;
  // The place in the tree, sections included; `route` is the URL path, which sections skip.
  readonly key: string;
  readonly route: string | null;
  readonly parentKey: string | null;
  readonly title: string | null;
  readonly position: number;
}

interface ReadSpace {
  readonly slug: string;
  readonly title: string;
  readonly icon: string;
  readonly description: string | null;
  readonly spec: SpaceSpec;
  readonly entries: readonly Entry[];
}

export interface DocSeedPage {
  readonly kind: "page" | "section";
  readonly slug: string;
  readonly key: string;
  readonly route: string | null;
  readonly parentKey: string | null;
  readonly position: number;
  readonly title: string;
  readonly description: string | null;
  readonly markdown: string;
}

export interface DocSeedSpace {
  readonly slug: string;
  readonly title: string;
  readonly icon: string;
  readonly description: string | null;
  readonly pages: readonly DocSeedPage[];
}

export interface DocTreeReading {
  readonly spaces: readonly DocSeedSpace[];
  // Links to files that are not there, published as plain text: `<file>: <href>`.
  readonly broken: readonly string[];
}

// The dependency graph in `docs/ai/rules/layering.md`, which is the order a reader meets them.
const PACKAGE_ORDER = [
  "errors",
  "core",
  "permissions",
  "observability",
  "contracts",
  "asset",
  "content",
  "application",
  "infrastructure",
  "auth",
  "composition",
  "api-server",
  "ui",
  "api-client",
  "query",
  "feature",
];

// One space per area, in the order the space list shows them. `folder` publishes one docs
// tree; `group` gathers every `<group>/<name>/docs/` under a generated first page.
const SPACES: readonly SpaceSpec[] = Object.freeze([
  { slug: "overview", title: "Documentation", icon: "book", file: "docs/index.md" },
  { slug: "explained", title: "Explained", icon: "rocket", folder: "docs/explained" },
  { slug: "ai", title: "AI rulebook", icon: "sparkle", folder: "docs/ai" },
  { slug: "opinions", title: "Opinions", icon: "chat", folder: "docs/opinions" },
  { slug: "scale", title: "Scaling up", icon: "chevron-up-down", folder: "docs/scale" },
  {
    slug: "infra",
    title: "Infrastructure",
    icon: "hash",
    folder: "docs/infra",
    // The compose directory's own docs, under the stack's, so the two infra trees are one.
    extra: [{ slug: "directory", title: "The infra/ directory", folder: "infra/docs" }],
  },
  {
    slug: "packages",
    title: "Packages",
    icon: "file",
    group: "packages",
    order: PACKAGE_ORDER,
    description:
      "Every workspace package's own docs: why its exports are shaped as they are, written next to the code.",
    intro: [
      "Every workspace package keeps its docs next to its code, in `packages/<name>/docs/`. Each",
      "explains why the package's exports are shaped as they are; its reference pages hold the",
      "reasoning that outgrew a two-line comment.",
      "",
      "Listed in the order of the dependency graph: a package imports only from packages to its",
      "left in that graph, never its right.",
    ],
  },
  {
    slug: "apps",
    title: "Apps",
    icon: "rocket",
    group: "apps",
    order: ["web", "worker", "realtime"],
    description:
      "The three programs that run: the web app, the background worker and the stream process.",
    intro: [
      "The three programs that run. Each is thin: it wires the packages together for one runtime",
      "and holds no business logic. Each keeps its docs next to its code, in `apps/<name>/docs/`.",
    ],
  },
  {
    slug: "tooling",
    title: "Tooling",
    icon: "key",
    group: "tooling",
    order: ["scripts", "biome-config", "eslint-config", "tsconfig"],
    description:
      "The configuration every package extends and the repository's own scripts: none of it ships.",
    intro: [
      "The configuration every package extends, and the repository's own scripts. None of it",
      "ships: it decides how the code is checked and built. Each keeps its docs in",
      "`tooling/<name>/docs/`.",
    ],
  },
  { slug: "plans", title: "Plans", icon: "check", folder: "docs/plans" },
]);

const LINK = /(!?)\[((?:[^\][]|\[[^\]]*\])*)\]\(([^)\s]+)\)/g;
const FENCE = /^\s*(`{3,}|~{3,})/;

// Reads every docs tree in the repository into seedable spaces, links rewritten to the
// routes they publish at. Touches no database: `DocSpaceSeed` writes what this returns.
export class DocTreeReader {
  public static readonly SLUGS: readonly string[] = Object.freeze(SPACES.map((s) => s.slug));

  // `repo` is the forge address links to other files point at; null turns them to text.
  public constructor(
    private readonly repoRoot: string,
    private readonly repo: string | null,
    private readonly branch: string,
  ) {}

  // Links to other files point at the git origin, on the branch the pages were read from.
  // The space stores the address too, and the contract takes only https.
  public static fromGit(repoRoot: string): DocTreeReader {
    const git = (command: string): string | null => {
      try {
        const stdio: ("ignore" | "pipe")[] = ["ignore", "pipe", "ignore"];
        return execSync(`git ${command}`, { cwd: repoRoot, stdio, encoding: "utf8" }).trim();
      } catch {
        return null;
      }
    };
    const origin = git("remote get-url origin");
    const ssh = origin?.match(/^git@([^:]+):(.+)$/);
    const web = origin && (ssh ? `https://${ssh[1]}/${ssh[2]}` : origin).replace(/\.git$/, "");
    const repo = web?.startsWith("https://") ? web : null;
    return new DocTreeReader(repoRoot, repo, git("rev-parse --abbrev-ref HEAD") ?? "main");
  }

  public get repositoryUrl(): string | null {
    return this.repo;
  }

  public read(): DocTreeReading {
    const spaces = SPACES.map((spec) => this.buildSpace(spec)).filter(
      (space): space is ReadSpace => space !== null,
    );
    const routes = DocTreeReader.routeTable(spaces);
    const broken: string[] = [];
    return {
      spaces: spaces.map((space) => ({
        slug: space.slug,
        title: space.title,
        icon: space.icon,
        description: space.description,
        pages: this.renderSpace(space, routes, broken),
      })),
      broken,
    };
  }

  // A single-line `key: value` frontmatter, which is the only shape the docs use.
  private static frontmatterOf(text: string): {
    title: string | null;
    description: string | null;
    body: string;
  } {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    const read = (key: string) => {
      const value = match?.[1]?.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1];
      return value ? value.trim().replace(/^"(.*)"$/, "$1") : null;
    };
    return {
      title: read("title"),
      description: read("description"),
      body: text.slice(match?.[0].length ?? 0),
    };
  }

  // A description over the API's cap is cut at a word rather than refused.
  private static clip(text: string | null, max: number): string | null {
    if (text === null || text.length <= max) return text;
    const cut = text.slice(0, max - 1);
    return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
  }

  private static isFolder(path: string): boolean {
    return existsSync(path) && statSync(path).isDirectory();
  }

  private static slugOf(name: string, where: string): string {
    const slug = name.toLowerCase();
    if (!SLUG.test(slug) || slug.length > SLUG_MAX) {
      throw new Error(`${where}: "${name}" cannot be a page slug (lowercase, digits, hyphens)`);
    }
    return slug;
  }

  // A page left out of `meta.json` would silently never publish, and one listed but
  // missing would publish nothing under its name. Both are refused.
  private metaOf(dir: string): { title?: string; pages: readonly string[] } {
    const file = join(dir, "meta.json");
    const where = relative(this.repoRoot, dir) || ".";
    if (!existsSync(file)) throw new Error(`${where} has Markdown but no meta.json to order it`);
    const meta = JSON.parse(readFileSync(file, "utf8")) as { title?: string; pages: string[] };
    const listed = new Set(meta.pages);
    for (const name of readdirSync(dir)) {
      const counts = name.endsWith(".md") || DocTreeReader.isFolder(join(dir, name));
      if (counts && !listed.has(name.replace(/\.md$/, ""))) {
        throw new Error(`${where}/${name} is not in meta.json`);
      }
    }
    for (const name of meta.pages) {
      if (!existsSync(join(dir, `${name}.md`)) && !DocTreeReader.isFolder(join(dir, name))) {
        throw new Error(`${where}/meta.json lists "${name}", which is not there`);
      }
    }
    return meta;
  }

  private buildSpace(spec: SpaceSpec): ReadSpace | null {
    const entries: Entry[] = [];
    const add = (entry: Omit<Entry, "position">): Entry => {
      const position = entries.filter((e) => e.parentKey === entry.parentKey).length;
      const placed = { ...entry, position };
      entries.push(placed);
      return placed;
    };
    const page = (
      file: string,
      slug: string,
      parentKey: string | null,
      parentRoute: string,
      title: string | null = null,
    ) =>
      add({
        kind: "page",
        file,
        slug,
        key: parentKey === null ? slug : `${parentKey}/${slug}`,
        route: parentRoute === "" ? slug : `${parentRoute}/${slug}`,
        parentKey,
        title,
      });

    // A folder's own `index.md` is the page it hangs under; at a space's root it is the
    // first page, `overview`. A folder without one is a section: a heading with no page.
    const walk = (dir: string, parentKey: string | null, parentRoute: string, atRoot: boolean) => {
      for (const name of this.metaOf(dir).pages) {
        if (name === "index") {
          if (atRoot) page(join(dir, "index.md"), "overview", parentKey, parentRoute);
          continue;
        }
        const sub = join(dir, name);
        const slug = DocTreeReader.slugOf(name, relative(this.repoRoot, sub));
        if (!DocTreeReader.isFolder(sub)) {
          page(join(dir, `${name}.md`), slug, parentKey, parentRoute);
        } else if (existsSync(join(sub, "index.md"))) {
          const node = page(join(sub, "index.md"), slug, parentKey, parentRoute);
          walk(sub, node.key, node.route ?? "", false);
        } else {
          const key = parentKey === null ? slug : `${parentKey}/${slug}`;
          const title = this.metaOf(sub).title ?? name;
          add({ kind: "section", file: null, slug, key, route: null, parentKey, title });
          walk(sub, key, parentRoute, false);
        }
      }
    };

    // A package's or app's docs folder becomes one page, its reference pages under it.
    const nested = (dir: string, slug: string, title: string | null = null) => {
      const node = page(join(dir, "index.md"), slug, null, "", title);
      walk(dir, node.key, node.route ?? "", false);
    };

    if (spec.file) {
      const file = join(this.repoRoot, spec.file);
      if (!existsSync(file)) return null;
      page(file, "overview", null, "");
    } else if (spec.folder) {
      const dir = join(this.repoRoot, spec.folder);
      if (!DocTreeReader.isFolder(dir)) return null;
      walk(dir, null, "", true);
      for (const extra of spec.extra ?? []) {
        const extraDir = join(this.repoRoot, extra.folder);
        if (existsSync(join(extraDir, "index.md"))) nested(extraDir, extra.slug, extra.title);
      }
    } else if (spec.group) {
      const root = join(this.repoRoot, spec.group);
      if (!DocTreeReader.isFolder(root)) return null;
      const found = readdirSync(root)
        .filter((name) => existsSync(join(root, name, "docs", "index.md")))
        .sort();
      // Listed order first; a docs folder the list does not name still publishes, last.
      const order = spec.order ?? [];
      const names = [
        ...order.filter((name) => found.includes(name)),
        ...found.filter((name) => !order.includes(name)),
      ];
      if (names.length === 0) return null;
      add({
        kind: "page",
        file: null,
        slug: "overview",
        key: "overview",
        route: "overview",
        parentKey: null,
        title: null,
      });
      for (const name of names) {
        nested(join(root, name, "docs"), DocTreeReader.slugOf(name, `${spec.group}/${name}`));
      }
    }

    let description = spec.description ?? null;
    if (description === null) {
      const first = entries.find((e) => e.file !== null);
      description = first?.file
        ? DocTreeReader.frontmatterOf(readFileSync(first.file, "utf8")).description
        : null;
    }
    return {
      slug: spec.slug,
      title: spec.title,
      icon: spec.icon,
      description: DocTreeReader.clip(description, DESCRIPTION_MAX),
      spec,
      entries,
    };
  }

  // Every file and folder a page is read from, to the route a reader opens it at. Built
  // from every space, so a link into another space resolves too.
  private static routeTable(spaces: readonly ReadSpace[]): ReadonlyMap<string, string> {
    const table = new Map<string, string>();
    for (const space of spaces) {
      for (const entry of space.entries) {
        if (entry.kind !== "page" || entry.file === null) continue;
        const route = `${DOC_ROOT}/${space.slug}/${entry.route}`;
        table.set(resolve(entry.file), route);
        if (entry.file.endsWith(`${sep}index.md`)) table.set(resolve(dirname(entry.file)), route);
      }
    }
    return table;
  }

  // A link to a seeded page becomes its route; a link to any other repository file becomes
  // its address on the forge, or plain text with nowhere to point. Code is left as written.
  private rewriteLinks(
    markdown: string,
    file: string,
    routes: ReadonlyMap<string, string>,
    broken: string[],
  ): string {
    let fence: string | null = null;
    return markdown
      .split("\n")
      .map((line) => {
        const opener = line.match(FENCE)?.[1];
        if (fence !== null) {
          if (opener && opener[0] === fence[0] && opener.length >= fence.length) fence = null;
          return line;
        }
        if (opener) {
          fence = opener;
          return line;
        }
        // Code spans that hold link syntax are set aside, so `[a](b)` written as code survives.
        const spans: string[] = [];
        const masked = line.replace(/(`+)(?:(?!\1).)*?\]\((?:(?!\1).)*?\1/g, (span) => {
          spans.push(span);
          return `${spans.length - 1}`;
        });
        const rewritten = masked.replace(
          LINK,
          (whole, bang: string, text: string, href: string) => {
            if (bang || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(href)) return whole;
            const [target = "", hash = ""] = href.split("#");
            const anchor = hash ? `#${hash}` : "";
            const absolute = resolve(dirname(file), decodeURI(target));
            const route = routes.get(absolute) ?? routes.get(absolute.replace(/[\\/]$/, ""));
            if (route !== undefined) return `[${text}](${route}${anchor})`;
            if (!existsSync(absolute)) {
              broken.push(`${relative(this.repoRoot, file)}: ${href}`);
              return text;
            }
            if (this.repo === null) return text;
            const kind = statSync(absolute).isDirectory() ? "tree" : "blob";
            const inRepo = relative(this.repoRoot, absolute).split(sep).join(posix.sep);
            return `[${text}](${this.repo}/${kind}/${this.branch}/${inRepo}${anchor})`;
          },
        );
        return rewritten.replace(/(\d+)/g, (_, at: string) => spans[Number(at)] ?? "");
      })
      .join("\n");
  }

  // A group space's generated first page: its intro, then one row per docs folder.
  private groupOverview(space: ReadSpace): string {
    const rows = space.entries
      .filter((e) => e.parentKey === null && e.file !== null)
      .map((e) => {
        const { title, description } = DocTreeReader.frontmatterOf(
          readFileSync(e.file ?? "", "utf8"),
        );
        const what = (description ?? "").replace(/\|/g, "\\|");
        return `| [${title ?? e.slug}](${DOC_ROOT}/${space.slug}/${e.route}) | ${what} |`;
      });
    const label = space.spec.group === "packages" ? "Package" : "Folder";
    return [
      ...(space.spec.intro ?? []),
      "",
      `| ${label} | What it is |`,
      "|---|---|",
      ...rows,
      "",
    ].join("\n");
  }

  // The reader prints the title above the page, so the Markdown's own `# Title` is dropped.
  private renderSpace(
    space: ReadSpace,
    routes: ReadonlyMap<string, string>,
    broken: string[],
  ): DocSeedPage[] {
    return space.entries.map((entry) => {
      const base = {
        kind: entry.kind,
        slug: entry.slug,
        key: entry.key,
        route: entry.route,
        parentKey: entry.parentKey,
        position: entry.position,
      };
      if (entry.kind === "section") {
        return { ...base, title: entry.title ?? entry.slug, description: null, markdown: "" };
      }
      if (entry.file === null) {
        return {
          ...base,
          title: space.title,
          description: space.description,
          markdown: this.groupOverview(space),
        };
      }
      const where = relative(this.repoRoot, entry.file);
      const source = DocTreeReader.frontmatterOf(readFileSync(entry.file, "utf8"));
      const title = entry.title ?? source.title;
      if (!title) throw new Error(`${where} has no title in its frontmatter`);
      if (title.length > TITLE_MAX) throw new Error(`${where}: title over ${TITLE_MAX} characters`);
      const body = source.body.replace(/^\s*#\s+.*\r?\n/, "").trim();
      const markdown = `${this.rewriteLinks(body, entry.file, routes, broken)}\n`;
      if (markdown.length > MARKDOWN_MAX) {
        throw new Error(`${where} is over ${MARKDOWN_MAX} characters; split it`);
      }
      return {
        ...base,
        title,
        description: DocTreeReader.clip(source.description, DESCRIPTION_MAX),
        markdown,
      };
    });
  }
}
