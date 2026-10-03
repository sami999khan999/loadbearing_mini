// Publishes the super admin guide in `guide/` into a running app's docs, through its own API.
// Usage: pnpm guide:publish <base-url> <credentials-file> <platform-organization-id> [--prune]

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "guide");
const [base, credentialsFile, platformOrganization, ...flags] = process.argv.slice(2);
if (!base || !credentialsFile || !platformOrganization) {
  throw new Error(
    "usage: pnpm guide:publish <base-url> <credentials-file> <platform-organization-id> [--prune]",
  );
}
const prune = flags.includes("--prune");

// `email=` and `password=` lines, read from a file so the password never sits in argv.
const credentials = Object.fromEntries(
  readFileSync(credentialsFile, "utf8")
    .trim()
    .split("\n")
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
);
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));

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
  // `docPage.publish` allows 30 a minute; a first publish of the whole guide passes that.
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
const switched = await post(`${base}/api/auth/organization/switch`, {
  organizationId: platformOrganization,
});
if (!switched.ok) throw new Error(`switch ${switched.status}`);

const want = manifest.space;
let space = (await rpc("docSpace/list", {})).items.find((item) => item.slug === want.slug);
if (!space) {
  // Created as `members`, then opened: opening a space is the `platform.doc.grant` step.
  space = await rpc("docSpace/create", {
    slug: want.slug,
    title: want.title,
    description: want.description,
    icon: want.icon,
    audience: "members",
    theme: want.theme,
  });
}
const drifted = ["title", "description", "audience", "theme", "icon"].some(
  (key) => space[key] !== want[key],
);
if (drifted) {
  space = await rpc("docSpace/update", {
    spaceId: space.id,
    slug: want.slug,
    title: want.title,
    description: want.description,
    icon: want.icon,
    audience: want.audience,
    theme: want.theme,
    position: space.position ?? 0,
  });
}

const tree = async () => (await rpc("docPage/tree", { spaceId: space.id })).items;
const bySlug = new Map((await tree()).map((node) => [node.slug, node]));
const counts = { created: 0, moved: 0, saved: 0, published: 0, removed: 0 };

const ensure = async (entry, kind, parentId, position) => {
  let node = bySlug.get(entry.slug);
  if (!node) {
    node = await rpc("docPage/create", {
      spaceId: space.id,
      parentId,
      kind,
      slug: entry.slug,
      title: entry.title,
      icon: entry.icon ?? null,
    });
    bySlug.set(entry.slug, node);
    counts.created++;
  }
  if (node.parentId !== parentId || node.position !== position) {
    await rpc("docPage/move", { pageId: node.id, parentId, position });
    counts.moved++;
  }

  const draft = await rpc("docPage/get", { pageId: node.id });
  const markdown =
    kind === "page" ? readFileSync(join(here, `${entry.slug}.md`), "utf8") : draft.markdown;
  const description = entry.description ?? null;
  const icon = entry.icon ?? null;
  const changed =
    draft.markdown !== markdown ||
    draft.title !== entry.title ||
    draft.description !== description ||
    draft.icon !== icon;
  if (changed) {
    await rpc("docPage/save", {
      pageId: node.id,
      draftVersion: draft.draftVersion,
      slug: entry.slug,
      title: entry.title,
      description,
      icon,
      url: null,
      markdown,
    });
    counts.saved++;
  }

  // A section holds pages and has no body of its own, so only a page is published.
  if (kind === "page") {
    const now = await rpc("docPage/get", { pageId: node.id });
    if (now.status !== "published") {
      await rpc("docPage/publish", { pageId: node.id, draftVersion: now.draftVersion });
      counts.published++;
    }
  }
  return node;
};

for (const [index, section] of manifest.sections.entries()) {
  const node = await ensure(section, "section", null, index);
  for (const [position, page] of section.pages.entries()) {
    await ensure(page, "page", node.id, position);
  }
}

if (prune) {
  const named = new Set(manifest.sections.flatMap((s) => [s.slug, ...s.pages.map((p) => p.slug)]));
  // Pages before sections, so a section is already empty when it goes.
  const stale = (await tree())
    .filter((node) => !named.has(node.slug))
    .sort((a, b) => Number(a.kind === "section") - Number(b.kind === "section"));
  for (const node of stale) {
    await rpc("docPage/remove", { pageId: node.id });
    console.log(`removed ${node.kind} ${node.slug}`);
    counts.removed++;
  }
}

console.log(JSON.stringify(counts));
