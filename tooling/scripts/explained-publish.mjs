// Publishes `docs/explained/` into a running app's docs, through its own API, as one space.
// Usage: pnpm explained:publish <base-url> <credentials-file> <organization-id> [options]

import { execSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = join(repoRoot, "docs/explained");

const [base, credentialsFile, organizationId, ...rest] = process.argv.slice(2);
if (!base || !credentialsFile || !organizationId) {
  throw new Error(
    [
      "usage: pnpm explained:publish <base-url> <credentials-file> <organization-id> [options]",
      "  --audience members|owner|public|granted  who may read it (default members);",
      "                                           public and granted need the platform organization",
      "  --slug <slug>                            the space's URL segment (default explained)",
      "  --repo <https url> --branch <name>       where links to other repository files point",
      "                                           (default: the git origin, branch main)",
      "  --prune                                  remove pages the folder no longer has",
    ].join("\n"),
  );
}
const option = (name, fallback) => {
  const at = rest.indexOf(`--${name}`);
  return at === -1 ? fallback : rest[at + 1];
};
const prune = rest.includes("--prune");
const spaceSlug = option("slug", "explained");
const audience = option("audience", "members");
if (!["members", "owner", "public", "granted"].includes(audience)) {
  throw new Error(`--audience must be members, owner, public or granted, not ${audience}`);
}
const branch = option("branch", "main");

// The origin's web address, so a link to a file outside the guide opens it on the forge.
const originUrl = () => {
  try {
    const url = execSync("git remote get-url origin", { cwd: repoRoot }).toString().trim();
    const ssh = url.match(/^git@([^:]+):(.+)$/);
    return (ssh ? `https://${ssh[1]}/${ssh[2]}` : url).replace(/\.git$/, "");
  } catch {
    return null;
  }
};
const repo = option("repo", originUrl());
if (repo !== null && !repo.startsWith("https://")) {
  throw new Error(`--repo must be an https URL, not ${repo}`);
}

// `email=` and `password=` lines, read from a file so the password never sits in argv.
const credentials = Object.fromEntries(
  readFileSync(credentialsFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

// ── the pages, read from the folder ────────────────────────────────────────────

const frontmatterOf = (text) => {
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

// The API caps a description at 300 characters; a longer one is cut at a word.
const clip = (text, max) => {
  if (text === null || text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
};

const metaOf = (dir) => JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));

// One entry per page, in `meta.json` order. A folder is a page from its `index.md`, with the
// folder's other pages under it. The guide's own `index.md` becomes the `overview` page.
const entries = [];
const walk = (dir, parentSlug, docPath) => {
  for (const name of metaOf(dir).pages) {
    const folder = join(dir, name);
    const isFolder = existsSync(folder) && statSync(folder).isDirectory();
    if (name === "index" && parentSlug !== null) continue;
    const file = isFolder ? join(folder, "index.md") : join(dir, `${name}.md`);
    const slug = name === "index" ? "overview" : name;
    const path = docPath ? `${docPath}/${slug}` : slug;
    entries.push({
      file,
      slug,
      path,
      parentSlug,
      position: entries.filter((e) => e.parentSlug === parentSlug).length,
    });
    if (isFolder) walk(folder, slug, path);
  }
};
walk(source, null, "");

const docRoot = audience === "public" || audience === "granted" ? "/docs" : "/doc";
const pathByFile = new Map(entries.map((e) => [resolve(e.file), e.path]));

// A link to another guide page becomes that page's route; a link to any other file in the
// repository becomes its address on the forge, or plain text when there is no forge.
const rewriteLinks = (markdown, file) => {
  let fenced = false;
  return markdown
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) fenced = !fenced;
      if (fenced) return line;
      return line.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, bang, text, href) => {
        if (bang || /^(?:[a-z][\w+.-]*:|\/|#)/i.test(href)) return whole;
        const [target = "", hash = ""] = href.split("#");
        const absolute = resolve(dirname(file), target);
        const anchor = hash ? `#${hash}` : "";
        const page = pathByFile.get(absolute);
        if (page !== undefined) return `[${text}](${docRoot}/${spaceSlug}/${page}${anchor})`;
        if (repo === null || !existsSync(absolute)) return text;
        const kind = statSync(absolute).isDirectory() ? "tree" : "blob";
        const inRepo = relative(repoRoot, absolute).split("\\").join(posix.sep);
        return `[${text}](${repo}/${kind}/${branch}/${inRepo}${anchor})`;
      });
    })
    .join("\n");
};

// The reader prints the title above the page, so the Markdown's own `# Title` is dropped.
const pageOf = (entry) => {
  const { title, description, body } = frontmatterOf(readFileSync(entry.file, "utf8"));
  if (!title) throw new Error(`${relative(repoRoot, entry.file)} has no title in its frontmatter`);
  const markdown = rewriteLinks(body.replace(/^\s*#\s+.*\r?\n/, "").trim(), entry.file);
  return { title, description: clip(description, 300), markdown: `${markdown}\n` };
};
const pages = entries.map((entry) => ({ ...entry, ...pageOf(entry) }));
const overview = frontmatterOf(readFileSync(join(source, "index.md"), "utf8"));

// ── the API ───────────────────────────────────────────────────────────────────

const jar = new Map();
const keep = (response) => {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
  }
};
const cookieHeader = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
const post = async (url, body) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookieHeader(), origin: base },
    body: JSON.stringify(body),
  });
  keep(response);
  return response;
};

const rpc = async (path, input, attempt = 0) => {
  const response = await post(`${base}/api/rpc/${path}`, { json: input });
  // `Object()` because `json()` is typed `unknown`; every shape read below is the API's own.
  const body = Object(await response.json().catch(() => ({})));
  if (response.status === 429 && attempt < 5) {
    console.log(`rate limited on ${path}, waiting 20 s`);
    await new Promise((done) => setTimeout(done, 20_000));
    return rpc(path, input, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(
      `${path} ${response.status}: ${JSON.stringify(body?.data ?? body).slice(0, 400)}`,
    );
  }
  return body.json;
};

const signIn = await post(`${base}/api/auth/sign-in/email`, {
  email: credentials.email,
  password: credentials.password,
});
if (!signIn.ok) throw new Error(`sign-in ${signIn.status}`);
const switched = await post(`${base}/api/auth/organization/switch`, { organizationId });
if (!switched.ok) throw new Error(`switch ${switched.status}`);

// ── the space ─────────────────────────────────────────────────────────────────

const want = {
  slug: spaceSlug,
  title: overview.title ?? "Explained",
  description: clip(overview.description, 300),
  icon: "book",
  audience,
  theme: null,
  repositoryUrl: repo,
};
let space = (await rpc("docSpace/list", {})).items.find((item) => item.slug === want.slug);
if (!space) {
  // Created as `members`, then opened: opening a space is the `platform.doc.grant` step.
  space = await rpc("docSpace/create", { ...want, audience: "members" });
}
const drifted = ["title", "description", "audience", "theme", "icon", "repositoryUrl"].some(
  (key) => space[key] !== want[key],
);
if (drifted) {
  space = await rpc("docSpace/update", {
    ...want,
    spaceId: space.id,
    position: space.position ?? 0,
  });
}

// ── the pages ─────────────────────────────────────────────────────────────────

const tree = async () => (await rpc("docPage/tree", { spaceId: space.id })).items;
const bySlug = new Map((await tree()).map((node) => [node.slug, node]));
const counts = { created: 0, moved: 0, saved: 0, published: 0, removed: 0 };

// In the folder's order, so a parent exists and is published before its children.
for (const page of pages) {
  const parentId = page.parentSlug === null ? null : bySlug.get(page.parentSlug).id;
  let node = bySlug.get(page.slug);
  if (!node) {
    node = await rpc("docPage/create", {
      spaceId: space.id,
      parentId,
      kind: "page",
      slug: page.slug,
      title: page.title,
      icon: null,
    });
    bySlug.set(page.slug, node);
    counts.created++;
  }
  if (node.parentId !== parentId || node.position !== page.position) {
    await rpc("docPage/move", { pageId: node.id, parentId, position: page.position });
    counts.moved++;
  }

  const draft = await rpc("docPage/get", { pageId: node.id });
  const changed =
    draft.markdown !== page.markdown ||
    draft.title !== page.title ||
    draft.description !== page.description;
  if (changed) {
    await rpc("docPage/save", {
      pageId: node.id,
      draftVersion: draft.draftVersion,
      slug: page.slug,
      title: page.title,
      description: page.description,
      icon: draft.icon ?? null,
      url: null,
      markdown: page.markdown,
    });
    counts.saved++;
  }
  const now = await rpc("docPage/get", { pageId: node.id });
  if (now.status !== "published") {
    await rpc("docPage/publish", { pageId: node.id, draftVersion: now.draftVersion });
    counts.published++;
  }
}

if (prune) {
  const named = new Set(pages.map((page) => page.slug));
  const nodes = await tree();
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  const depth = (id) => {
    let level = 0;
    for (let at = parentOf.get(id); at; at = parentOf.get(at)) level++;
    return level;
  };
  // Deepest first, so removing a page never takes a stale child with it before its turn.
  const stale = nodes
    .filter((node) => !named.has(node.slug))
    .sort((a, b) => depth(b.id) - depth(a.id));
  for (const node of stale) {
    await rpc("docPage/remove", { pageId: node.id });
    console.log(`removed ${node.kind} ${node.slug}`);
    counts.removed++;
  }
}

console.log(JSON.stringify(counts));
console.log(`${base}${docRoot}/${spaceSlug}`);
