// Publishes every docs tree in the repository into a running app's docs, one space per area,
// through the app's own API. Usage: pnpm docs:publish <base-url> <credentials-file> <org-id>

// @ts-check

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readSpaces, renderSpace, routeTable, SPACES } from "./docs-tree.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const USAGE = [
  "usage: pnpm docs:publish <base-url> <credentials-file> <organization-id> [options]",
  "       pnpm docs:publish --dry-run [options]",
  "  --space <slug>                           only this space; repeat for more",
  `                                           (${SPACES.map((s) => s.slug).join(", ")})`,
  "  --audience members|owner|public|granted  who may read them (default members);",
  "                                           public and granted need the platform organization",
  "  --repo <https url> --branch <name>       where links to other repository files point",
  "                                           (default: the git origin and the current branch)",
  "  --prune                                  remove pages the trees no longer have",
  "  --dry-run                                print what would publish; send nothing",
].join("\n");

const argv = process.argv.slice(2);
const flags = new Set(["--prune", "--dry-run"]);
const valued = new Set(["--space", "--audience", "--repo", "--branch"]);
/** @type {string[]} */
const positional = [];
/** @type {{ space: string[], audience: string, repo?: string, branch?: string }} */
const options = { space: [], audience: "members" };
for (let at = 0; at < argv.length; at++) {
  const arg = argv[at] ?? "";
  if (flags.has(arg)) continue;
  if (valued.has(arg)) {
    const value = argv[++at];
    if (value === undefined) throw new Error(`${arg} needs a value\n${USAGE}`);
    if (arg === "--space") options.space.push(value);
    else if (arg === "--audience") options.audience = value;
    else if (arg === "--repo") options.repo = value;
    else options.branch = value;
  } else if (arg.startsWith("--")) {
    throw new Error(`unknown option ${arg}\n${USAGE}`);
  } else {
    positional.push(arg);
  }
}
const dryRun = argv.includes("--dry-run");
const prune = argv.includes("--prune");
const [base, credentialsFile, organizationId] = positional;
if (!dryRun && (!base || !credentialsFile || !organizationId)) throw new Error(USAGE);

const { audience } = options;
if (!["members", "owner", "public", "granted"].includes(audience)) {
  throw new Error(`--audience must be members, owner, public or granted, not ${audience}`);
}
const known = SPACES.map((s) => s.slug);
for (const slug of options.space) {
  if (!known.includes(slug)) throw new Error(`--space ${slug} is not one of ${known.join(", ")}`);
}

const git = (command) => {
  try {
    return execSync(`git ${command}`, { cwd: repoRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};
// The origin's web address, so a link to a file outside the docs opens it on the forge.
const originUrl = () => {
  const url = git("remote get-url origin");
  if (url === null) return null;
  const ssh = url.match(/^git@([^:]+):(.+)$/);
  return (ssh ? `https://${ssh[1]}/${ssh[2]}` : url).replace(/\.git$/, "");
};
const repo = options.repo ?? originUrl();
if (repo !== null && !repo.startsWith("https://")) {
  throw new Error(`--repo must be an https URL, not ${repo}`);
}
// The branch the pages were read from, so a link shows the file as these pages describe it.
const branch = options.branch ?? git("rev-parse --abbrev-ref HEAD") ?? "main";

// ── the pages, read and checked before anything is sent ─────────────────────────

const docRoot = audience === "public" || audience === "granted" ? "/docs" : "/doc";
// Every tree is read for the route table, so a link into a space not being published still
// resolves to where that space lives.
const everySpace = readSpaces(repoRoot);
const routes = routeTable(everySpace, docRoot);
/** @type {string[]} */
const broken = [];
const context = { routes, repoRoot, repo, branch, broken, docRoot };
const spaces = everySpace
  .filter((space) => options.space.length === 0 || options.space.includes(space.slug))
  .map((space) => ({ ...space, pages: renderSpace(space, context) }));

for (const line of broken) console.warn(`broken link, published as plain text: ${line}`);

if (dryRun) {
  for (const space of spaces) {
    console.log(`\n${space.title}  ${docRoot}/${space.slug}  (${space.pages.length} entries)`);
    for (const page of space.pages) {
      const depth = page.key.split("/").length - 1;
      const where = page.kind === "section" ? "(section)" : `/${page.route}`;
      console.log(`${"  ".repeat(depth + 1)}${page.title}  ${where}`);
    }
  }
  const total = spaces.reduce((sum, space) => sum + space.pages.length, 0);
  console.log(`\n${spaces.length} spaces, ${total} entries, ${broken.length} broken links`);
  process.exit(0);
}

if (!credentialsFile) throw new Error(USAGE);
// `email=` and `password=` lines, read from a file so the password never sits in argv.
const credentials = Object.fromEntries(
  readFileSync(credentialsFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);

// ── the API ─────────────────────────────────────────────────────────────────────

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

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// `docPage.publish` allows 30 a minute. Pacing below it is cheaper than a 429 and a retry.
const PUBLISH_LIMIT = 30;
const published = [];
const pacePublish = async () => {
  const now = Date.now();
  while (published.length > 0 && now - published[0] > 61_000) published.shift();
  if (published.length >= PUBLISH_LIMIT - 1) {
    const ms = 61_000 - (now - published[0]);
    if (ms > 5_000) console.log(`publish limit reached, waiting ${Math.ceil(ms / 1000)} s`);
    await wait(ms);
  }
  published.push(Date.now());
};

const rpc = async (path, input, attempt = 0) => {
  if (path === "docPage/publish") await pacePublish();
  const response = await post(`${base}/api/rpc/${path}`, { json: input });
  // `Object()` because `json()` is typed `unknown`; every shape read below is the API's own.
  const body = Object(await response.json().catch(() => ({})));
  if (response.status === 429 && attempt < 5) {
    const after = Number(response.headers.get("retry-after"));
    const ms = Number.isFinite(after) && after > 0 ? after * 1000 : 20_000;
    console.log(`rate limited on ${path}, waiting ${Math.ceil(ms / 1000)} s`);
    await wait(ms);
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

// ── one space ───────────────────────────────────────────────────────────────────

// `position` is stored as sent and nothing renumbers, so only this script's spaces are placed;
// a space someone else made keeps the place they gave it.
const syncSpace = async (space, existing, position) => {
  const want = {
    slug: space.slug,
    title: space.title,
    description: space.description,
    icon: space.icon,
    audience,
    theme: null,
    repositoryUrl: repo,
  };
  let row = existing.find((item) => item.slug === space.slug);
  if (!row) {
    // Created as `members`, then opened: opening a space is the `platform.doc.grant` step.
    row = await rpc("docSpace/create", { ...want, audience: "members" });
    console.log(`created space ${space.slug}`);
  }
  const drifted =
    row.position !== position ||
    ["title", "description", "audience", "theme", "icon", "repositoryUrl"].some(
      (key) => row[key] !== want[key],
    );
  if (drifted) row = await rpc("docSpace/update", { ...want, spaceId: row.id, position });
  return row;
};

// A node's place in the tree, sections included: the same `key` the reader gave each entry.
const keyed = (nodes) => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const keyOf = (node) => {
    const segments = [node.slug];
    for (let at = byId.get(node.parentId); at; at = byId.get(at.parentId)) {
      segments.unshift(at.slug);
    }
    return segments.join("/");
  };
  return new Map(nodes.map((node) => [keyOf(node), node]));
};

const depthOf = (nodes) => {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]));
  return (id) => {
    let level = 0;
    for (let at = parentOf.get(id); at; at = parentOf.get(at)) level++;
    return level;
  };
};

const syncPages = async (space, row) => {
  const counts = { created: 0, moved: 0, saved: 0, published: 0, removed: 0 };
  const tree = async () => (await rpc("docPage/tree", { spaceId: row.id })).items;
  let byKey = keyed(await tree());

  // A node whose kind changed (a folder that gained or lost its index) cannot be converted:
  // it goes, deepest first, and is created again below.
  const wrongKind = space.pages
    .map((page) => byKey.get(page.key))
    .filter((node, at) => node && node.kind !== space.pages[at].kind);
  if (wrongKind.length > 0) {
    const depth = depthOf([...byKey.values()]);
    for (const node of wrongKind.sort((a, b) => depth(b.id) - depth(a.id))) {
      await rpc("docPage/remove", { pageId: node.id });
      counts.removed++;
    }
    byKey = keyed(await tree());
  }

  // In reading order, so a parent exists and is published before its children.
  for (const page of space.pages) {
    const parentId = page.parentKey === null ? null : byKey.get(page.parentKey).id;
    let node = byKey.get(page.key);
    if (!node) {
      node = await rpc("docPage/create", {
        spaceId: row.id,
        parentId,
        kind: page.kind,
        slug: page.slug,
        title: page.title,
        icon: null,
      });
      byKey.set(page.key, node);
      counts.created++;
    }
    if (node.parentId !== parentId || node.position !== page.position) {
      await rpc("docPage/move", { pageId: node.id, parentId, position: page.position });
      counts.moved++;
    }

    const draft = await rpc("docPage/get", { pageId: node.id });
    // A section has no body: its draft keeps whatever Markdown it was created with.
    const markdown = page.kind === "page" ? page.markdown : draft.markdown;
    const changed =
      draft.markdown !== markdown ||
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
        markdown,
      });
      counts.saved++;
    }
    if (page.kind === "page") {
      const now = await rpc("docPage/get", { pageId: node.id });
      if (now.status !== "published") {
        await rpc("docPage/publish", { pageId: node.id, draftVersion: now.draftVersion });
        counts.published++;
      }
    }
  }

  if (prune) {
    const wanted = new Set(space.pages.map((page) => page.key));
    const nodes = await tree();
    const depth = depthOf(nodes);
    // Deepest first, so removing a page never takes a stale child with it before its turn.
    const stale = [...keyed(nodes)]
      .filter(([key]) => !wanted.has(key))
      .map(([, node]) => node)
      .sort((a, b) => depth(b.id) - depth(a.id));
    for (const node of stale) {
      await rpc("docPage/remove", { pageId: node.id });
      console.log(`  removed ${node.kind} ${node.slug}`);
      counts.removed++;
    }
  }
  return counts;
};

// ── verify: every page is in the published tree, every link lands ──────────────

const navPaths = (nav, into = new Set()) => {
  for (const node of nav) {
    if (node.kind === "page" && node.path) into.add(node.path);
    navPaths(node.children, into);
  }
  return into;
};

const verify = async () => {
  const problems = [];
  const pathsBySpace = new Map();
  const htmlByRoute = new Map();
  for (const space of spaces) {
    const { nav } = await rpc("docSpace/nav", { slug: space.slug });
    const paths = navPaths(nav);
    pathsBySpace.set(space.slug, paths);
    for (const page of space.pages) {
      if (page.kind !== "page") continue;
      if (!paths.has(page.route)) {
        problems.push(`${space.slug}/${page.route} is not in the published tree`);
        continue;
      }
      const { page: read } = await rpc("docPage/read", { space: space.slug, path: page.route });
      htmlByRoute.set(`${docRoot}/${space.slug}/${page.route}`, read?.html ?? "");
    }
  }
  // A link into a space this run did not publish is checked against that space's live tree.
  const link = new RegExp(`\\]\\((${docRoot.replace("/", "\\/")}\\/[^)#\\s]+)(#[^)\\s]+)?\\)`, "g");
  for (const space of spaces) {
    for (const page of space.pages) {
      for (const [, route, hash] of page.markdown.matchAll(link)) {
        const [, , target, ...rest] = route.split("/");
        const path = rest.join("/");
        let paths = pathsBySpace.get(target);
        if (!paths) {
          paths = navPaths((await rpc("docSpace/nav", { slug: target })).nav);
          pathsBySpace.set(target, paths);
        }
        const from = `${space.slug}/${page.route ?? page.key}`;
        if (!paths.has(path)) {
          problems.push(`${from} links to ${route}, which is not published`);
        } else if (hash && htmlByRoute.has(route)) {
          const id = decodeURIComponent(hash.slice(1));
          if (!htmlByRoute.get(route)?.includes(`id="${id}"`)) {
            problems.push(`${from} links to ${route}${hash}, which has no such heading`);
          }
        }
      }
    }
  }
  return problems;
};

// ── run ─────────────────────────────────────────────────────────────────────────

const existing = (await rpc("docSpace/list", {})).items;
const totals = { created: 0, moved: 0, saved: 0, published: 0, removed: 0 };
for (const space of spaces) {
  // The place in `SPACES`, not in this run, so publishing one space never reorders the rest.
  const row = await syncSpace(space, existing, known.indexOf(space.slug));
  const counts = await syncPages(space, row);
  for (const key of Object.keys(totals)) totals[key] += counts[key];
  console.log(`${space.slug}: ${JSON.stringify(counts)}`);
}

const problems = await verify();
console.log(JSON.stringify(totals));
for (const space of spaces) console.log(`${base}${docRoot}/${space.slug}`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`✗ ${problem}`);
  process.exit(1);
}
console.log(`verified: every page is published and every link between them lands`);
