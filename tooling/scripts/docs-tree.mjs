// Reads every docs tree in the repository into doc spaces, one per area, and rewrites each
// page's links to the routes they publish at. No network: `docs-publish.mjs` sends the result.

// @ts-check

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";

// The API's own limits (`DocSpaceContract`, `DocPageContract`), checked here so a bad page
// fails before anything is sent rather than halfway through a publish.
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 60;
const TITLE_MAX = 160;
const DESCRIPTION_MAX = 300;
const MARKDOWN_MAX = 200_000;

// The order a package is listed in: the dependency graph in `docs/ai/rules/layering.md`.
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
export const SPACES = [
  {
    slug: "overview",
    title: "Documentation",
    icon: "book",
    file: "docs/index.md",
  },
  {
    slug: "explained",
    title: "Explained",
    icon: "rocket",
    folder: "docs/explained",
  },
  {
    slug: "ai",
    title: "AI rulebook",
    icon: "sparkle",
    folder: "docs/ai",
  },
  {
    slug: "opinions",
    title: "Opinions",
    icon: "chat",
    folder: "docs/opinions",
  },
  {
    slug: "scale",
    title: "Scaling up",
    icon: "chevron-up-down",
    folder: "docs/scale",
  },
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
  {
    slug: "plans",
    title: "Plans",
    icon: "check",
    folder: "docs/plans",
  },
];

// A single-line `key: value` frontmatter, which is the only shape the docs use.
export const frontmatterOf = (text) => {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const read = (key) => {
    const value = match?.[1]?.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1];
    return value ? value.trim().replace(/^"(.*)"$/, "$1") : null;
  };
  return {
    title: read("title"),
    description: read("description"),
    body: text.slice(match?.[0].length ?? 0),
  };
};

// A description over the API's cap is cut at a word rather than refused.
export const clip = (text, max) => {
  if (text === null || text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

const isFolder = (path) => existsSync(path) && statSync(path).isDirectory();

const slugOf = (name, where) => {
  const slug = name.toLowerCase();
  if (!SLUG.test(slug) || slug.length > SLUG_MAX) {
    throw new Error(`${where}: "${name}" cannot be a page slug (lowercase, digits, hyphens)`);
  }
  return slug;
};

const metaOf = (dir, repoRoot) => {
  const file = join(dir, "meta.json");
  const where = relative(repoRoot, dir) || ".";
  if (!existsSync(file)) throw new Error(`${where} has Markdown but no meta.json to order it`);
  const meta = JSON.parse(readFileSync(file, "utf8"));
  // A page left out of `meta.json` would silently never publish; one listed but missing
  // would publish nothing under its name. Both are refused.
  const listed = new Set(meta.pages);
  for (const name of readdirSync(dir)) {
    const stem = name.replace(/\.md$/, "");
    const counts = name.endsWith(".md") || isFolder(join(dir, name));
    if (counts && !listed.has(stem)) throw new Error(`${where}/${name} is not in meta.json`);
  }
  for (const name of meta.pages) {
    if (!existsSync(join(dir, `${name}.md`)) && !isFolder(join(dir, name))) {
      throw new Error(`${where}/meta.json lists "${name}", which is not there`);
    }
  }
  return meta;
};

// Every docs tree, as spaces of entries in reading order. An entry's `key` is its place in
// the tree (sections included); its `route` is the URL path, which sections add nothing to.
/** @param {string} repoRoot @param {string[] | null} [wanted] */
export const readSpaces = (repoRoot, wanted = null) => {
  const spaces = [];
  for (const spec of SPACES) {
    if (wanted !== null && !wanted.includes(spec.slug)) continue;
    const space = buildSpace(repoRoot, spec);
    if (space !== null) spaces.push(space);
  }
  return spaces;
};

const buildSpace = (repoRoot, spec) => {
  const entries = [];
  const add = (entry) => {
    const position = entries.filter((e) => e.parentKey === entry.parentKey).length;
    entries.push({ ...entry, position });
    return entry;
  };
  const page = (file, slug, parentKey, parentRoute, title = null) => {
    const key = parentKey === null ? slug : `${parentKey}/${slug}`;
    const route = parentRoute === "" ? slug : `${parentRoute}/${slug}`;
    return add({ kind: "page", file, slug, key, route, parentKey, title });
  };

  // A folder's own `index.md` is the page it hangs under; at a space's root it is the first
  // page, `overview`. A folder without one is a section: a sidebar heading with no page.
  const walk = (dir, parentKey, parentRoute, atRoot) => {
    for (const name of metaOf(dir, repoRoot).pages) {
      const where = relative(repoRoot, join(dir, name));
      if (name === "index") {
        if (atRoot) page(join(dir, "index.md"), "overview", parentKey, parentRoute);
        continue;
      }
      const sub = join(dir, name);
      const slug = slugOf(name, where);
      if (!isFolder(sub)) {
        page(join(dir, `${name}.md`), slug, parentKey, parentRoute);
      } else if (existsSync(join(sub, "index.md"))) {
        const node = page(join(sub, "index.md"), slug, parentKey, parentRoute);
        walk(sub, node.key, node.route, false);
      } else {
        const key = parentKey === null ? slug : `${parentKey}/${slug}`;
        const meta = metaOf(sub, repoRoot);
        add({ kind: "section", slug, key, route: null, parentKey, title: meta.title ?? name });
        walk(sub, key, parentRoute, false);
      }
    }
  };

  // A package's or app's docs folder becomes one page, its reference pages under it.
  const nested = (dir, slug, parentKey, title = null) => {
    const node = page(join(dir, "index.md"), slug, parentKey, "", title);
    walk(dir, node.key, node.route, false);
    return node;
  };

  let description = spec.description ?? null;
  if (spec.file) {
    const file = join(repoRoot, spec.file);
    if (!existsSync(file)) return null;
    page(file, "overview", null, "");
  } else if (spec.folder) {
    const dir = join(repoRoot, spec.folder);
    if (!isFolder(dir)) return null;
    walk(dir, null, "", true);
    for (const extra of spec.extra ?? []) {
      const extraDir = join(repoRoot, extra.folder);
      if (existsSync(join(extraDir, "index.md"))) {
        nested(extraDir, extra.slug, null, extra.title);
      }
    }
  } else {
    const root = join(repoRoot, spec.group);
    if (!isFolder(root)) return null;
    const found = readdirSync(root)
      .filter((name) => existsSync(join(root, name, "docs", "index.md")))
      .sort();
    // Listed order first; a docs folder the list does not name still publishes, last.
    const names = [
      ...spec.order.filter((name) => found.includes(name)),
      ...found.filter((name) => !spec.order.includes(name)),
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
      nested(join(root, name, "docs"), slugOf(name, `${spec.group}/${name}`), null);
    }
  }

  if (description === null) {
    const first = entries.find((e) => e.file !== null);
    description = first ? frontmatterOf(readFileSync(first.file, "utf8")).description : null;
  }
  return {
    slug: spec.slug,
    title: spec.title,
    icon: spec.icon,
    description: clip(description, DESCRIPTION_MAX),
    spec,
    entries,
  };
};

// ── links ───────────────────────────────────────────────────────────────────────

// Every file and folder a page is published from, to the route a reader opens it at.
export const routeTable = (spaces, docRoot) => {
  const table = new Map();
  for (const space of spaces) {
    for (const entry of space.entries) {
      if (entry.kind !== "page" || entry.file === null) continue;
      const route = `${docRoot}/${space.slug}/${entry.route}`;
      table.set(resolve(entry.file), route);
      if (entry.file.endsWith(`${sep}index.md`)) table.set(resolve(dirname(entry.file)), route);
    }
  }
  return table;
};

const LINK = /(!?)\[((?:[^\][]|\[[^\]]*\])*)\]\(([^)\s]+)\)/g;
const FENCE = /^\s*(`{3,}|~{3,})/;

// A link to a published page becomes its route; a link to any other repository file becomes
// its address on the forge, or plain text with nowhere to point. Code is left as written.
export const rewriteLinks = (markdown, file, context) => {
  const { routes, repoRoot, repo, branch, broken } = context;
  let fence = null;
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
      const spans = [];
      const masked = line.replace(/(`+)(?:(?!\1).)*?\]\((?:(?!\1).)*?\1/g, (span) => {
        spans.push(span);
        return `\uE000${spans.length - 1}\uE001`;
      });
      const rewritten = masked.replace(LINK, (whole, bang, text, href) => {
        if (bang || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(href)) return whole;
        const [target = "", hash = ""] = href.split("#");
        const anchor = hash ? `#${hash}` : "";
        const absolute = resolve(dirname(file), decodeURI(target));
        const route = routes.get(absolute) ?? routes.get(absolute.replace(/[\\/]$/, ""));
        if (route !== undefined) return `[${text}](${route}${anchor})`;
        if (!existsSync(absolute)) {
          broken.push(`${relative(repoRoot, file)}: ${href}`);
          return text;
        }
        if (repo === null) return text;
        const kind = statSync(absolute).isDirectory() ? "tree" : "blob";
        const inRepo = relative(repoRoot, absolute).split(sep).join(posix.sep);
        return `[${text}](${repo}/${kind}/${branch}/${inRepo}${anchor})`;
      });
      return rewritten.replace(/\uE000(\d+)\uE001/g, (_, at) => spans[Number(at)]);
    })
    .join("\n");
};

// ── pages ───────────────────────────────────────────────────────────────────────

// The generated first page of a `group` space: its intro, then one row per docs folder.
const groupOverview = (space, context) => {
  const rows = space.entries
    .filter((e) => e.parentKey === null && e.file !== null)
    .map((e) => {
      const { title, description } = frontmatterOf(readFileSync(e.file, "utf8"));
      const route = `${context.docRoot}/${space.slug}/${e.route}`;
      const what = (description ?? "").replace(/\|/g, "\\|");
      return `| [${title ?? e.slug}](${route}) | ${what} |`;
    });
  const label = space.spec.group === "packages" ? "Package" : "Folder";
  return [...space.spec.intro, "", `| ${label} | What it is |`, "|---|---|", ...rows, ""].join(
    "\n",
  );
};

// Each entry with what the API is sent: title, description and the rewritten Markdown. The
// reader prints the title above the page, so the Markdown's own `# Title` is dropped.
export const renderSpace = (space, context) =>
  space.entries.map((entry) => {
    if (entry.kind === "section") return { ...entry, description: null, markdown: "" };
    if (entry.file === null) {
      return {
        ...entry,
        title: space.title,
        description: space.description,
        markdown: groupOverview(space, context),
      };
    }
    const where = relative(context.repoRoot, entry.file);
    const source = frontmatterOf(readFileSync(entry.file, "utf8"));
    const title = entry.title ?? source.title;
    if (!title) throw new Error(`${where} has no title in its frontmatter`);
    if (title.length > TITLE_MAX) throw new Error(`${where}: title over ${TITLE_MAX} characters`);
    const body = source.body.replace(/^\s*#\s+.*\r?\n/, "").trim();
    const markdown = `${rewriteLinks(body, entry.file, context)}\n`;
    if (markdown.length > MARKDOWN_MAX) {
      throw new Error(`${where} is over ${MARKDOWN_MAX} characters; split it`);
    }
    return { ...entry, title, description: clip(source.description, DESCRIPTION_MAX), markdown };
  });
