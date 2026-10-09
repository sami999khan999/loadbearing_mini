---
title: Backlog
description: The only open ledger for the lite kit — work found and not yet planned. Items graduate into a plan or are dropped.
schema: backlog/v1
---

# Backlog

The live plan is [`LITE-KIT-PLAN.md`](LITE-KIT-PLAN.md).

Checkboxes: `[ ]` todo, `[~]` in progress, `[!]` blocked, `[x]` done, `[-]` dropped.

## 1. Found while building

- [ ] `BL.1` **`tooling/scripts` tests end in a Vitest worker timeout.** All 145 tests pass, then
  Vitest reports `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` and the run exits 1. A
  spec blocks the worker's event loop long enough (the fixture harness runs the architecture
  check synchronously) that the progress RPC times out. Seen twice on 2026-09-30, both times with
  other packages testing in parallel. **The big kit shows the same at the cut commit** (run alone,
  2026-09-30): pre-existing upstream, so fix it there and port the fix.

## 2. The docs system — gaps shared with the big kit

The docs slice is the same code in both kits, so each gap here is open in the big kit too, under
the ID given; fix it once and port it. Found 2026-10-10. Semantic search over docs is not here:
decision 7 in [`DOCS-SYSTEM-PLAN.md`](DOCS-SYSTEM-PLAN.md) replaces it with whole-docs full text.
What is still owed by that plan is there and in [`TESTS.md`](TESTS.md): the latency budgets
(`DS0.2`) and the hand checks.

- [ ] `BL.2` **No diff between revisions.** The history lists every publish and restores one into
  the draft, but shows no comparison. **Fix:** a line diff of a revision's Markdown against the
  draft, computed in the browser from the revision read, which is already cached. Big kit: `DC.1`.
- [ ] `BL.3` **An image upload's size is checked as declared, not as sent.**
  `UploadDocImageUseCase` refuses a declared size over 5 MB, but a presigned `PUT` does not bind
  the length, so a writer holding the URL could send more until it expires. **Fix:** a presigned
  `POST` with a `content-length-range` condition, which needs a `StorageGateway` method. Big kit:
  `DC.4`.
- [ ] `BL.4` **A page's images outlive the page.** Deleting a space sweeps its prefix through
  `DocImageSweep`, but deleting one page leaves its images, since another page may link them.
  **Fix:** a sweep that lists a space's prefix and deletes what no published or draft Markdown in
  the space names. Big kit: `DC.5`.
- [ ] `BL.5` **A tenant export leaves out doc images.** The export reads partitions; images live
  only in the bucket under the tenant's doc prefix. **Fix:** copy that prefix into the export. Big
  kit: `DC.6`.
- [ ] `BL.6` **A production bucket needs a CORS rule before images can be uploaded.** MinIO allows
  every origin by default, so nothing here noticed. **Fix:** document the rule in `docs/infra/`
  beside the bucket's other settings, and set it where the bucket is provisioned. Big kit: `DC.7`.
- [ ] `BL.7` **The in-app reader still sends a page's HTML and markdown twice.** `/doc/<space>/…`
  dehydrates both the query cache and the loader data. `DS0.10` fixed only the public `/docs`
  reader. **Fix:** strip the loader copy as `/docs/$space/$` does. Big kit: `LP.2`.
