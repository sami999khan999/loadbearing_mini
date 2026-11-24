---
title: Docs
description: One slice for public, private and organization docs — why platform docs are the platform organization's rows, how a page is rendered once and read from one row, and who may read what.
---

# Docs

A space is a sidebar of pages. Organizations write spaces for their members; the platform organization
writes the product's docs, some public, some opened to chosen organizations, people and plans. **One
slice, not three** — one schema, use-case set, renderer and reader.

## Platform docs are the platform organization's rows

Catalog tables for platform docs would mean two schemas, two repositories, every rule twice. "An
anonymous reader has no shard" is true, but the shard key is an organization, and the platform's is always
known (`PlatformReader.organizationId()`) — so a public read is placed there by `Container.placedAt`, with
an empty system principal that only places.

| | Where it lives | Who writes it |
|---|---|---|
| An organization's spaces | `doc_spaces`, `doc_pages`, `doc_revision`, `doc_sections` — routed, `LIST (organization_id)` | its members holding `doc.page.write` |
| The platform's spaces | the same four tables, under the platform organization | the platform organization's members, with the same keys |
| Who may read a granted platform space | `doc_space_grants` — catalog | platform admins, `platform.doc.grant` |

Grants are the one catalog table — they name anyone in the deployment and are read before placement,
like `entitlement_adjustments`. Columns are `grantee_organization_id`, `grantee_user_id`,
`grantee_plan_key`, never `organization_id` (which §17 would read as a tenant's).

## Who may write

**Writing needs membership in the owning organization:** each write asserts its `doc.*` key there and
every repository call is scoped to it (`doc-write-authorization.spec.ts`).

| Key | Lets a member |
|---|---|
| `doc.page.write` | add, edit, move and delete pages, upload images, restore a revision |
| `doc.page.publish` | publish a page |
| `doc.space.manage` | create, edit and delete spaces |

The same keys in the platform organization write platform docs (`platform_admin` holds all; a "Docs
editor" role can hold just these). **Moving a space onto `public` or `granted` also needs
`platform.doc.grant`** (`DocRules.assertMayOpen`); editing an already-open space does not.

## Who may read a space

A space has an **audience**:

| Audience | Who reads it | Allowed on |
|---|---|---|
| `members` | holders of `doc.page.read` in the owning organization | any organization |
| `public` | anyone, signed in or not | the platform organization only |
| `granted` | platform admins, and anyone a grant reaches | the platform organization only |
| `owner` | its author, and nobody else | any organization |

`DocRules.assertAudience` refuses `public`/`granted` elsewhere. Inside an organization `doc.page.read`
reads every `members` space; other audiences widen who *else* reads.

**`owner` is the one that narrows** — the author's (`created_by`) alone; everyone else, admins and
platform admins included, gets `NOT_FOUND` (never `FORBIDDEN`, so slugs cannot be probed). Every use-case
on a space or page calls `DocRules.assertVisible` first; `list`, search and the tree filter with
`isVisible` before ranking; `DocAccess.canRead` checks it before any grant — so never `/llms.txt` or the
public reader. Grants on one are refused (`error.field.private`); only the author switches to `owner`
(`assertAudienceChange`); `doc_spaces_owner_idx` serves the lookup. **A private space's slug ends in six
random characters** (`BL.16`, `DocRules.storedSlug`), else `slug: taken` would reveal it.

| Viewer | `members` | `public` | `granted` | `owner` |
|---|---|---|---|---|
| the author, a member | reads | reads | reads | reads |
| another member | reads | reads | reads | `NOT_FOUND` |
| an org or platform admin | reads | reads | reads | `NOT_FOUND` |
| a signed-out visitor | `NOT_FOUND` | reads | `NOT_FOUND` | `NOT_FOUND` |

Platform `public`/`granted` spaces are read from outside through `DocAccess.canRead`; a platform
`owner` space only by its author inside the platform organization (`FC.11`). **An orphaned `owner` space**
(author no longer active, `BL.15`) is listed by slug alone to `doc.space.manage` holders
(`ListOrphanedDocSpacesUseCase`, "Private spaces of former members") and deleted unread; otherwise it stays
`NOT_FOUND`, and a reactivated author finds it intact.

A grant reaches a viewer by name, via their active organization, or via its plan — **the plan is how a
private space rides an entitlement**, with no per-organization rows. The readable set is one catalog
query cached 60 s as `doc:access:<organization>:<user>`; a grant write clears the whole prefix (a plan's
reach is unlistable). **Not yours is not found** — never `FORBIDDEN`.

## Access links: a doc that follows a feature

An **access link** narrows the audience to readers with a feature — one rule in a space's or page's
`access` column:

| Link | The reader passes when | Read through |
|---|---|---|
| `module` | the module is visible to them | its gate's permission, so the plan mask and a switched-off module apply |
| `permission` | they hold the key | `CapabilitySet`, after roles, overrides, platform denies and the plan |
| `flag` | the flag is on for their organization | `FlagCache.onFor`, one read per request |
| `plan` | their organization is on that plan | `EntitlementRepository.findPlanOf`, cached 60 s as `doc:plan:<org>` |

**Every link must pass**; a page's rule adds to its space's; a hidden page hides its children, and an
emptied section disappears. **Hidden is not found** — absent from sidebar, search, switcher, `/llms.txt`
and raw Markdown, and `NOT_FOUND` by link.
- **Signed out passes no link** (no organization, plan or permission).
- **A vanished key fails closed.**
- **Readers are judged against their own organization** — a platform doc linked to `apikey` shows to
  whoever has it.

| Reader | No link | `module: apikey` | `permission: rbac.role.manage` | `plan: team` |
|---|---|---|---|---|
| admin, on a plan with `apikey`, on `team` | reads | reads | reads | reads |
| member, on a plan without `apikey`, on `free` | reads | `NOT_FOUND` | `NOT_FOUND` | `NOT_FOUND` |
| signed out | reads (public only) | `NOT_FOUND` | `NOT_FOUND` | `NOT_FOUND` |

`DocFeaturePolicy` holds the checks: module and permission read the in-memory `CapabilitySet`; flags
and plan are fetched only when named, once per request (`DocFeatureScope`) — **unlinked docs cost
nothing**. Rules are copied onto `doc_spaces.nav` nodes, so tree filtering reads no page rows.
**Setting a link** needs `doc.space.manage` (space) or `doc.page.write` (page) — links only narrow.
`assertKnown` (before the transaction; plans are catalog) refuses unknown keys and platform-scope
permissions. A link is structure, live on save; omitting `access` keeps the stored rule.

## Raw Markdown, Open in AI and the repository link

`/api/doc/<space>/<path>` serves Markdown source reading as nobody, so only for **public, unlinked**
pages — which alone get the Open menu's raw Markdown, **Open in ChatGPT** and **Open in Claude** (a prompt
naming the absolute source URL). Others would hand the tool a 404; `DocNavTree.isLinked` checks space,
page and ancestors. A space's `https` `repository_url` shows a GitHub icon in the sidebar footer.

## A page is rendered once

`PublishDocPageUseCase` renders on publish, never on read, behind `MarkdownRenderer` (the parser is
node-only; [`doc-renderer.md`](../../../infrastructure/docs/reference/doc-renderer.md)). The editor preview
uses the same renderer via `docPage.preview` — a client parser would be a second, eventually lying, one.

## A read is one row

`doc_pages` holds both halves of a page:

| Columns | Read by |
|---|---|
| `title`, `markdown`, `draft_version`, … | the editor |
| `published_title`, `published_html`, `published_toc`, `published_markdown`, `revision_no`, … | the reader |

Both bodies are TOASTed, so **no query selects `*`**. The row's published snapshot makes `doc_revision`
pure history — archiving revisions cannot break a live page. **The sidebar is one column:**
`doc_spaces.nav`, rebuilt by `DocTree` in the changing transaction, `version` + 1 each time. Nodes carry
`revision_no`, so a page's cache key comes from the tree alone:

| Key | Holds | Lifetime |
|---|---|---|
| `doc:space:<org>:<slug>` | the space and its tree | 60 s, deleted after each commit that changes it |
| `doc:page:<org>:<page>:<revision>` | a published page | one day; never stale, since a new revision is a new key |
| `doc:spaces:<org>` | every space in the organization, without trees | 60 s, deleted with any space |

**Warm is zero queries, cold is two.** Deletes run after commit (inside, a reader would re-cache the old
row). The platform organization id is remembered per process.

## A large space costs a page read nothing extra

**A page read carries the tree trimmed** — `DocRules.trimNav` keeps sections' pages and the read page's
ancestors' children; other branches are `folded: true`. The full tree follows from `docSpace.nav`
(organization) or `/api/doc-nav/<space>?v=<version>` (platform, versioned so `immutable` for signed-out
readers and CDNs). Only open branches and near-viewport sections render.

`pnpm ops doc-bench`: a public 2,000-page space, its 20 largest at the 200,000-character cap, queries from
`pg_stat_statements`. 2026-10-01, one web process, load 11–15 on 4 cores:

| Path | Before | After |
|---|---|---|
| Page read, warm | 28 req/s, 5 queries | 59 req/s, **0 queries** |
| Page read, cold | 28 req/s, 6.2 queries | 54 req/s, 0.9 queries |
| Page HTML, 2,000-page space | 347 KB | 97 KB |
| Full tree, fetched once per version | in every page | 328 KB, 48 KB gzipped, `immutable` |
| Search, p95 | 46 ms | 60 ms |
| Render of the largest page | 792 ms | 563–1,201 ms, p95 7 ms |

**Those were flattered:** a CommonJS shim loaded a second React, so production SSR failed cheaply on any
Base UI page. Nitro now traces `react` and `react-dom` (`apps/web/vite.config.ts`). 2026-10-02, one
production process, same machine:

| Path | Req/s |
|---|---|
| A page in a small space | 224–239 |
| A page in the 2,000-page space, 501 links in its sidebar | 18 → 39 |
| Raw Markdown | 287 |

The large-sidebar gain: `DocLink` no longer UUID-parses every path (a failed `safeParse` builds a stack —
half the render), and reader links are plain anchors with one delegated listener
(`useDocLinkNavigation`) routing and preloading — a router `<Link>` builds a location per render.

**Article HTML ships once:** hydration carries `html: ""` and `ArticleHtmlStore` (`apps/web`) reads the
server markup back, kept by page and revision. The largest page is 1.1 MB raw, 59 KB gzipped — the proxy
compresses, not Node (`docs/infra/deployment.md`).

## Two authors, one page

Saves and publishes `UPDATE … WHERE draft_version = $expected`; the row lock gives one winner, the
loser `CONFLICT`. The revision number is a row counter under the same lock (a unique index on
`doc_revision` cannot lead with the page once it has a month level).

- **Restore writes the draft**; going live is a separate publish. Restore is disabled with unsaved edits
  (it remounts the editor; autosave clears them in two seconds).
- **Autosave fires two seconds after the last key**; leaving inside that window prompts (router blocker
  plus `beforeunload`).
- **Compare** lazily fetches the revision and diffs its Markdown against the saved draft in the browser
  (`diff`, unchanged runs folded to three lines); revisions cache forever, unsaved edits are excluded.

## Structure is live, content is published

Text goes live on publish; **slug, icon and position are structure**, live on save (else tree and pages
disagree). Sections and links, contentless, exist in the tree at once. Paths skip sections (`/writing`,
not `/guides/writing`), so `DocRules.assertTree` checks paths tree-wide — pages under two sections can
collide.

## Search

`doc_sections` holds a row per heading plus one per title, replaced in the publish transaction, with a
`simple` `tsvector` (one index for every language). Every word becomes a prefix (`instal:*` finds
"Installation"), rebuilt from letters and digits so no operator reaches `to_tsquery`; titles also match by
trigram ("quik start"). Excerpts are plain text, never rendered as HTML.

**The palette searches all docs** — every visible space in `/doc`, every readable platform space in
`/docs`. Spaces are filtered first (audience, access links) and only they are queried, then each hit is
checked against the reader's filtered tree, so hidden pages never appear. The open space's hits lead;
others follow by name, in server rank.

### Search by meaning (`DC.2`)

With an embedding provider, tenant search is hybrid. `doc.page.published` makes the `doc-index`
subscriber queue the page (title, description, markdown) as one document — source id the page's,
`sourceType: "doc"`, `spaceId` on each chunk; `doc.page.deleted`/`doc.space.deleted` forget them.
`DocSearch` queries `doc` chunks **within visible spaces only** (on the input set), fuses by page with
reciprocal rank (k = 60), keeps text hits' headings and anchors, gives meaning-only pages one hit with the
chunk text, then runs the tree check.

**Cost:** one embedding call per search; a failing provider falls back to full text. Platform search
(`/docs`) stays full text — another tenant's index on the requester's node. **Doc chunks never reach
shared document search** (`SearchDocumentsUseCase` excludes guarded types; `QueueDocumentIndexUseCase`
refuses `doc` and page ids). Pre-`DC.2` pages: `pnpm ops ai-reindex --docs`.

## Images

Images upload straight to storage: `docPage.upload` checks key, type and declared size and signs a
five-minute `POST` policy whose length range and content type storage enforces; the app never holds the
bytes. **The key is the index** — `doc/<organization>/<space>/<id>.<type>`, no image table:

| When | What goes |
|---|---|
| A space is deleted | its prefix, after the commit |
| A tenant is purged | its prefix, beside the partition drop |
| A page is deleted | the space's unlinked images, an hour later, by `doc-image-orphans` |

**Deleting a page does not delete its images** (others may link them): it queues one deduplicated
`doc-image-orphans` job, an hour later, placed on the tenant's node. `DocImageOrphans` collects every link
from any tenant page (drafts, published, all revisions — so restores are safe) as a short list, pages
through the prefix deleting unlinked images, **skips uploads under an hour old** (from the v7 id; uploads
are signed before the linking text saves), never deletes a key it would not write, and logs
`doc.images.swept` when it removed something.

Pages link `/api/doc-image/<organization>/<space>/<type>/<id>`, never the bucket: the route applies the
page's reading rules and redirects to a one-hour signed URL; no extension, since dev servers serve
`*.png` statically (likewise raw Markdown has no `.md`); a foreign organization is 404 before placement,
so guesses cost no shard lookup. **Raster only** — an SVG can carry script.

> [!IMPORTANT]
> Uploads are cross-origin `POST`s: MinIO allows any origin, but S3 or R2 needs a CORS rule for the app's
> origin, or uploads fail in the browser with nothing in the app's logs. See
> [the bucket's CORS rule](../../../../docs/infra/deployment.md#the-buckets-cors-rule).
