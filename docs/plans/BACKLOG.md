---
title: Backlog
description: The only open ledger for the lite kit — work found and not yet planned. Items graduate into a plan or are dropped.
schema: backlog/v1
---

# Backlog

The live plan is [`LITE-KIT-PLAN.md`](LITE-KIT-PLAN.md).

Checkboxes: `[ ]` todo, `[~]` in progress, `[!]` blocked, `[x]` done, `[-]` dropped.

## 1. Found while building

- [x] `BL.1` **`tooling/scripts` tests end in a Vitest worker timeout.** All 145 tests pass, then
  Vitest reports `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` and the run exits 1. A
  spec blocks the worker's event loop long enough (the fixture harness runs the architecture
  check synchronously) that the progress RPC times out. Seen twice on 2026-09-30, both times with
  other packages testing in parallel. **The big kit shows the same at the cut commit** (run alone,
  2026-09-30): pre-existing upstream, so fix it there and port the fix.
  **Done 2026-10-10.** The fixture harness runs the check through an awaited `execFile`. Three
  runs beside the big kit's suite, all green. `ae5836c`.

## 2. The docs system — gaps shared with the big kit

The docs slice is the same code in both kits, so each gap here is open in the big kit too, under
the ID given; fix it once and port it. Found 2026-10-10. Semantic search over docs, which
decision 7 in [`DOCS-SYSTEM-PLAN.md`](DOCS-SYSTEM-PLAN.md) first replaced with full text, was ported
from the big kit's `DC.2` on 2026-10-14, and Docs search is hybrid. What is still owed by that plan is there and in [`TESTS.md`](TESTS.md): the latency budgets
(`DS0.2`) and the hand checks.

- [x] `BL.2` **No diff between revisions.** The history lists every publish and restores one into
  the draft, but shows no comparison. **Fix:** a line diff of a revision's Markdown against the
  draft, computed in the browser from the revision read, which is already cached. Big kit: `DC.1`.
  **Done 2026-10-10.** A Compare action per revision opens a line diff against the saved draft.
  `doc-revision-diff.panel.spec.tsx`. `cdacbe0f`.
- [x] `BL.3` **An image upload's size is checked as declared, not as sent.**
  `UploadDocImageUseCase` refuses a declared size over 5 MB, but a presigned `PUT` does not bind
  the length, so a writer holding the URL could send more until it expires. **Fix:** a presigned
  `POST` with a `content-length-range` condition, which needs a `StorageGateway` method. Big kit:
  `DC.4`.
  **Done 2026-10-10.** `StorageGateway.presignPost` binds `content-length-range` and the type;
  MinIO refuses an over-limit body with 400. `4ad36521`.
- [x] `BL.4` **A page's images outlive the page.** Deleting a space sweeps its prefix through
  `DocImageSweep`, but deleting one page leaves its images, since another page may link them.
  **Fix:** a sweep that lists a space's prefix and deletes what no published or draft Markdown in
  the space names. Big kit: `DC.5`.
  **Done 2026-10-10.** A page delete queues `doc-image-orphans` for its space; `DocImageOrphans`
  deletes what no draft, page or revision names. `47bf8e65`.
- [x] `BL.5` **A tenant export leaves out doc images.** The export reads partitions; images live
  only in the bucket under the tenant's doc prefix. **Fix:** copy that prefix into the export. Big
  kit: `DC.6`.
  **Done 2026-10-10.** `exportTenant` copies `doc/<org>/` into `export/<org>/<day>/doc-image/` and
  lists each in the manifest. `52b9919b`.
- [x] `BL.6` **A production bucket needs a CORS rule before images can be uploaded.** MinIO allows
  every origin by default, so nothing here noticed. **Fix:** document the rule in `docs/infra/`
  beside the bucket's other settings, and set it where the bucket is provisioned. Big kit: `DC.7`.
  **Done 2026-10-10.** The rule, `POST` from the app origin, is in `docs/infra/deployment.md`;
  MinIO refuses a per-bucket rule, so dev sets none. `d987ebb5`.
- [x] `BL.7` **The in-app reader still sends a page's HTML and markdown twice.** `/doc/<space>/…`
  dehydrates both the query cache and the loader data. `DS0.10` fixed only the public `/docs`
  reader. **Fix:** strip the loader copy as `/docs/$space/$` does. Big kit: `LP.2`.
  **Done 2026-10-10.** The loader awaits the query and returns nothing;
  `apps/web/tests/route/doc-loader.spec.ts`. `0e5b4e9b`.

## 3. Fixed with the big kit on 2026-10-10

Shared code, fixed in the big kit first and ported here, each under its big-kit ID. They were
never boxes in this file, so they are recorded once here.

- [x] `AX7.5` Every `color-mix` in `packages/ui` is `in oklab`, so a tinted badge keeps its hue in
  dark themes; `color.md` and `palette.md` say why. `d9fe1211`.
- [x] `AX3.10` `check-architecture` §18 counts a primary key leading with a foreign key. `a75b361`.
- [x] `AX1.8` The rule-file size claims state the measured ceiling, ~1,650 tokens. `82c72b14`.
- [x] `AX2.11` `packages/permissions/docs/index.md` lists one file per line. `8f8ed273`.
- [x] `AX4.15` `listFlags` returns readonly arrays without copying them. `0825a478`.
- [x] `UI.2` The narrow-screen sidebar drawer is a Base UI dialog, so it traps focus. `fa910157`.
- [x] `RV.4` Stream revalidation is one registry per process, one query per tenant per tick.
  `bb2cc516..9a2675a9`.
- [x] `RV.7` §14 fails a `// ──` separator that splits a sentence; 17 comments rejoined. `b4325c5`.
- [x] `CP7.9` Web no longer serves `realtime.*`; the stream smoke spec dials `apps/realtime`.
  `cbee47c7`.
- [x] `CR.33` Index text is staged in the bucket and the job carries its key, so the one Redis no
  longer holds up to 100 KB a job. `639282ad..6bc83ebe`, `408392a9`.
- [x] `RW.7`–`RW.15` The 2026-10-10 backend review: `/api/doc-nav` keeps API-key responses
  private, a role rename leaves its grants alone, doc tree edits lock the space, a role an
  invitation names refuses deletion as in use, a notification retry resends mail and frames, index
  jobs serialize per document, suspended users get no notifications, nightly expiry runs in
  batches, and enrolment never returns a deactivated membership. `1415efbf..38c1739c`.
- [x] `RW.16`–`RW.23` The 2026-10-10 frontend review: the editor's image picker and mode toggle
  work by keyboard, the page tree's delete confirm is announced and its moves cannot double-fire,
  the command palette ignores Enter during IME composition, the copy button survives a missing
  clipboard, row actions name their row, and focus stays put after revoking a key.
  `ad6853f9..77fab190`.

## 4. From the 2026-10-10 review

Found in code both kits share, fixed in the big kit under the ID given and ported here.

- [x] `BL.8` **The doc editor drops unsaved edits without a word.** Autosave runs two seconds
  after the last key, and nothing blocks navigation or unload while the form is dirty; a restore
  remounts the form too. **Fix:** block while dirty, and flush before a restore. Big kit: `RW.1`.
  **Done 2026-10-10.** The route asks before leaving with unsaved edits, by link or by closing the
  tab, and Restore waits until the draft is saved. `91fcb711`.
- [x] `BL.9` **A mail job carries a live invite, reset link or 2FA code** in its `params`, kept a
  week after a final failure, in the one Redis. **Fix:** render in the producer, encrypt `params`,
  or keep failed mail jobs briefly. Big kit: `RW.2`.
  **Done 2026-10-10.** Mail holding a link or code is marked `credential`; its job is dropped a
  minute after sending and an hour after its last failure. `cdfe4dfd`.
- [x] `BL.10` **The exports screen cannot hand out the doc-image copies** it now includes; only the
  manifest names them. Big kit: `RW.4`.
  **Done 2026-10-10.** Each export day saves its images as a file of paths and hour-long links,
  from `platform.listExportImages`. `442dd418`.
- [x] `BL.11` **Two enrolment paths were not checked for the deactivated-membership loop**, and a
  suspended user with an active membership still enrols. Big kit: `RW.5`.
  **Done 2026-10-10.** Bootstrap declines a deactivated membership; the claimer skips an invitation
  to a tenant that deactivated the user, and refuses a suspended user. The session hook already
  refused a suspended user before enrolling. `bbd7d5c1`.

## 5. Final check of 2026-10-10

Three reviewers read this kit first, then the code it shares with the big kit. The shared fixes
landed there first under `FC.<n>` and were ported; `FC.11` and `FC.12` are this kit's own.

- [x] `FC.1` An index job dedupes only while in flight, so a revert or a resubmit after a failure
  is queued. `763001d3`.
- [x] `FC.2` The image orphan sweep counts a link from any space's page. `dc2deae5`.
- [x] `FC.3` A sent credential mail job is removed as it completes. `dd4f7041`.
- [x] `FC.4` The cron schedules run in UTC, and the old local-time entries are removed.
  `ef0e9547`.
- [x] `FC.5` The setup guide's `AUTH_SECRET` placeholder no longer boots. `e36f196e`.
- [x] `FC.6` The desktop origin is matched exactly. `113adbc3`.
- [x] `FC.8` Widening the screen closes the sidebar drawer. `29f2c959`.
- [x] `FC.9` The export links file's URL is revoked after the download starts. `62e102c8`.
- [x] `FC.10` Doc search asks the index about the reader's spaces only, so another author's `owner`
  space no longer takes the window. `2276b322`.
- [x] `FC.11` **A private platform `owner` space was readable by its author from any
  organization.** Only inside the platform organization now. `doc-access.spec`. `58d22992`.
- [x] `FC.12` **`ai:reindex` jobs ran once, and a rerun after a failure did nothing.** It
  publishes through `BullMqQueuePublisher`, with its retries and an in-flight id. `fe62daab`.

Then the six left from it, fixed on the same day. The first three are shared and came from the big
kit's `FC.13`–`FC.15`.

- [x] `BL.12` **No security headers.** Every page and `/api` route now carries
  `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, a referrer policy and, over https, HSTS.
  No `script-src` yet: Start's inline scripts need nonces. `5dc02d50`.
- [x] `BL.13` **Web processes times the pool was not checked.** `cluster.mjs` keeps inside
  `WEB_DATABASE_CONNECTIONS`, 100 here, half of Postgres's 200. `90348dd3`, `76762252`.
- [x] `BL.14` **Production booted on an `http` `AUTH_URL`.** Refused, except on a loopback host.
  `f009512f`.
- [x] `BL.15` **An `owner` space outlived its author.** Once the author is no longer an active
  member, a manager sees the space by slug on the manage page and may delete it, unread.
  `doc-orphaned-space.spec`. `9187d5eb`.
- [x] `BL.16` **A slug taken by someone's private space said so.** A private space's address ends
  in six random characters, so a manager's `notes` never meets it. `doc.rules.spec`. `4724f37d`.
- [x] `BL.17` **`deletePrefix` scanned the queue's keys too.** Measured: 250 round trips beside
  50,000 queue keys, twice per role change. The cache moves to Redis database 1, and a SCAN walks
  one database. `202d11f7`.

## 6. Found walking this kit in a browser, 2026-10-10

The checks in [`TESTS.md`](TESTS.md), run by hand. Shared fixes landed in the big kit first under
its `FC.<n>`.

- [x] `FC.16` A bad input read "Something went wrong": oRPC's input check now becomes field
  violations. `cbe976af`.
- [x] `FC.17` Forms now show what is wrong with each field. `3d6935df`.
- [x] `FC.18` Server functions refuse a cross-site call. `4ea4eaf3`.
- [x] `FC.19` No page hydrated in dev after `start.ts` arrived: `router.tsx` imports
  `createIsomorphicFn` from the package. `9196d360`.
- [x] `BL.15` follow-up: deleting a former member's space was a 500, because the membership was
  read inside the routed transaction. It is read first now. `15ba660f`.

