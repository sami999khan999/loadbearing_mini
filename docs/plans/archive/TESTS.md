---
title: Tests to run
description: Every test run the lite kit build still owes, by plan item, with the commands, so the build can go ahead on typecheck alone and the runs can be done in one pass.
---

# Tests to run

From `LT2.6` on, the build goes ahead on typecheck and `check:architecture` alone, and the owner
runs the tests. This page lists every run still owed. Tick a row when it has passed; if it fails,
add a line under it saying what failed.

**Last full pass:** `d7ba5b3` (`LT2.5`), 2026-10-01. Every package's suite, `pnpm smoke` and
`boot-smoke.mjs` for all three apps were green. The only red `check:architecture` assertion is the
partition allowlist, which `LT2.8` clears.

## The standard pass

Run the whole block after any item below, and again once at the end.

```bash
pnpm install
node tooling/scripts/compose.mjs up -d --remove-orphans   # five containers
pnpm build:packages
pnpm --filter @loadbearing/web build
pnpm db:migrate && pnpm db:seed
pnpm -r --no-bail run typecheck
pnpm lint
pnpm -r --no-bail run test          # not `pnpm test`: that stops at the first red package
CI= node tooling/scripts/check-architecture.mjs
pnpm check:contrast && pnpm deps:check && pnpm repo:check
pnpm smoke                          # needs the containers
pnpm --filter @loadbearing/worker build && pnpm --filter @loadbearing/realtime build
for app in worker web realtime; do node --env-file=.env tooling/scripts/boot-smoke.mjs $app; done
```

The local `.env` needs a real `AUTH_SECRET` (`openssl rand -hex 32`); the template's `change-me` makes
the web app answer 500.

## Owed, by item

| Item | What to run | Status |
|---|---|---|
| `LT2.6` env | 2026-11-12: the standard pass, whole, green: typecheck, lint, 2,291 tests, `check-architecture` 31/31, contrast, deps, repo, smoke 32, and `boot-smoke` for worker, web and realtime. | [x] |
| `LT2.7` worker | 2026-11-12: the standard pass, whole, green: typecheck, lint, 2,291 tests, `check-architecture` 31/31, contrast, deps, repo, smoke 32, and `boot-smoke` for worker, web and realtime. `boot-smoke.mjs worker` booted, then drained and exited cleanly. | [x] |
| `LT2.8` baseline | 2026-11-12, without `infra:reset`, which would have wiped the walk data: a scratch database took every migration from `0000_lite_baseline.sql` to `0009_messaging_grants`, and its 358 columns and 156 indexes on non-partition tables match the dev database exactly. `drizzle-kit generate` reports no schema changes. The pre-cut database no longer exists to diff against; the migrations now carry messaging back, so the comparison it asked for has moved on. | [x] |
| `LT1.6` docs | 2026-11-12: `check-architecture` §15 passes. The grep finds widgets, zones and ClickHouse only in the rules, `docs/scale/`, the plans and big-kit notes; messaging is back, so two pages that still called it removed were corrected. `minio-init` exits 0 and leaves the bucket `private`; `docker compose ps` shows postgres, redis and mailpit `healthy` and minio `running`, as `docs/infra/index.md` says; Redis holds the queue in database 0 and the cache in database 1, so the `flushall` warning stands. | [x] |
| `LT3` owner audience | 2026-11-12: the standard pass, whole, green: typecheck, lint, 2,291 tests, `check-architecture` 31/31, contrast, deps, repo, smoke 32, and `boot-smoke` for worker, web and realtime. It includes `doc-access.spec.ts`. The manual audience check passed on 2026-10-10, below. | [x] |
| `LT4` search | 2026-11-12: the standard pass, whole, green: typecheck, lint, 2,291 tests, `check-architecture` 31/31, contrast, deps, repo, smoke 32, and `boot-smoke` for worker, web and realtime. It includes the three search specs. Still owed: the Gemini and OpenAI half, which needs real keys. | [~] |
| `UI` Tailwind and Base UI | 2026-11-12, by hand in headless Chromium: `/kitchen-sink` in all six themes, light and dark, nothing unstyled; by keyboard `Select` and `Menu` (arrows, Home/End, Escape back to the trigger), the popover (Escape returns focus), `Dialog` (focus held), `AlertDialog` (Cancel first), `ThemeToggle` (arrows); the invite form's role select; the doc reader in a Forest space, whose palette kept Forest and followed a hit on Enter. The drawer now traps focus (`UI.2`). | [x] |
| `LT5` tooling and CI | CI runs on a push to `main`. Its first runs after the cut failed and were fixed in `b4263aa..192c27d` (the plan's exit, "CI green"); every run since, and every pull request from `dev`, has been green. Today's `dev` reaches CI when it is merged. | [x] |
| `DS0` docs performance | 2026-11-12: the standard pass, whole, green: typecheck, lint, 2,291 tests, `check-architecture` 31/31, contrast, deps, repo, smoke 32, and `boot-smoke` for worker, web and realtime. Still owed: `pnpm doc:bench` on a quiet machine for `DS0.2`, and `DS0.6`. | [~] |
| `DS1` access links | 2026-11-12, by hand in Bob's organization: a page linked to `rbac.role.manage` reads for the owner and is 404 and absent from the sidebar for a member; a `module: apikey` page shows on `unlimited` and on a `pro` plan holding every key, and is gone on a `starter` plan without `apikey.*`; a `plan: pro` page shows only while the organization is on `pro`, within the documented minute. A flag link waits for a flag to exist. | [~] |
| `DS2` whole-docs search | Specs passed 2026-10-02: `doc-search.spec.ts` (application), `doc-search.panel.spec.tsx` (feature). By hand: the palette found hits on several pages of a space. 2026-11-12: a search from the Handbook reader listed the Runbook hit under "In Runbook". | [x] |
| `DS3` reading aids | `doc-reader.panel.spec.tsx` and `nav-tree.spec.tsx` passed 2026-10-02. Breadcrumbs, the pager, collapsible sections and the space icon were checked by hand in the reader. | [x] |
| `DS4` Markdown blocks | Renderer and prose specs passed 2026-10-02. `pnpm doc:rerender` ran end to end: 2004 pages moved to version 3, and a second run did nothing. Tabs (arrow keys), steps, accordions and card icons were checked on `/kitchen-sink` and in the reader. | [x] |
| `DS5` repository and Open in AI | `doc-reader.panel.spec.tsx` passed 2026-10-02. By hand: the GitHub icon sits in the sidebar footer; Open offers Markdown, ChatGPT and Claude on a public page, and only Edit on a linked one. Still owed: following each link to confirm the AI tool fetches the page. | [ ] |
| `DS6` visual pass | Checked 2026-10-02: the reader in all six themes, light and dark (midnight is dark only), against the reference in `graphite` dark; `/kitchen-sink` Doc blocks; 375 px wide with no horizontal scroll. | [x] |

## Manual checks, at the end

From the plan's verification section. Users alice, bob and carol (`Correct-Horse-9`), web on
port 23000, mail in Mailpit on 28025, with the worker running.

- [x] Sign up and verify through Mailpit, which shows that the worker's mail path works.
      2026-10-10: passed; the sent job leaves Redis as it completes.
- [x] Invite a user to an org and grant a role. Enable 2FA and create an API key.
      2026-10-10: passed, 2FA sign-in included; the key reads members and is refused roles.
- [~] Toggle a flag and an entitlement in platform admin.
      2026-10-10: a plan narrowed an org's menu at once. No flag is declared, so none to toggle.
- [x] As a platform admin, export a tenant, then delete one on the accounts page. After a delete, its
      `cold/` objects stay for 30 days and `pnpm db:partitions --sweep <id>` removes them early.
- [x] The dashboard shows the module nav and the member count, and the bell only for members who
      hold `notification.inbox.read`.
- [x] The docs audience matrix from `LT3`. 2026-10-10: public, members and owner, signed out,
      as another member and as the author; search hides the private space. Granted not walked.
- [~] AI search in all three modes from `LT4`. With `none` there are no outbound calls.
      2026-10-10: `none` passed. `openai` and `gemini` wait for real keys.
- [x] A notification arrives in realtime. 2026-10-10: the bell rose with no reload.
- [x] The Assistant in a browser, with `ASSISTANT_PROVIDER=fake` and `ASSISTANT_FAKE_DELAY_MS`
      set: send, the stream moving, Stop, reload mid-answer, two tabs, rename, delete, both
      locales, keyboard only, and the usage meter for an admin but not a member.
      2026-11-12: passed in headless Chromium at 150 ms a chunk, as bob (owner) and carol
      (member). A reload mid-answer resumed at the next word; the second tab took the new
      thread, the rename by Enter and the delete. A lost source is covered by spec only.
- [ ] The Assistant against a real provider, once per `openai`, `openrouter` and `gemini`, with
      keys from the owner.
