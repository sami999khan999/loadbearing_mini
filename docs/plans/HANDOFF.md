---
title: Handoff
description: How to pick the lite kit up on any machine — the standard pass, the decisions behind the cut, and the traps that cost time.
---

# Handoff

Every plan is done and pushed (`origin`, `main`). Open work is in [`BACKLOG.md`](BACKLOG.md), and each
item waits on a key, a quiet machine, a public URL or a declared flag. This page holds how to check the
tree and what lives nowhere else. Git history has the commit-by-commit record of the cut.

## Picking it up

```bash
cd loadbearing_mini                       # wherever the clone lives
cp .env.example .env
pnpm install
pnpm infra:up
pnpm build:packages                       # before db:migrate — it imports dist/
pnpm db:migrate && pnpm db:seed
pnpm --filter @loadbearing/web build      # generates the route tree typecheck needs
pnpm -r --no-bail run typecheck
CI= node tooling/scripts/check-architecture.mjs
```

## The standard pass

Run the whole block after any backlog item, and once at the end.

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
the web app answer 500. Test users are alice, bob and carol (`Correct-Horse-9`); web on 23000, Mailpit
on 28025, worker running.

## Decisions behind the cut

- **Keep the seams:** tables stay partitioned, shard placement stays, one node.
- **The build runs typecheck and `check:architecture` only** (owner's call, 2026-10-01); every owed
  test run goes in [`BACKLOG.md`](BACKLOG.md) for the owner to run in one pass.
- **Flags stay server-side only.** `widget.dismissal` left with widgets, so `FLAGS` is empty and none
  reaches the browser until widgets return; `flags.assertOn` still gates procedures with `NOT_FOUND`.
  A flag spec declares its own: `application/tests/support/example-flag.ts` stubs
  `FlagRegistry.instance` with `example.rollout`, and `FlagRegistry` stays the big kit's file.
- **Tenant export and delete stay**, moved to `platform/accounts.tsx`. **A tenant delete keeps its
  30-day archive**; archived notifications went.
- **The tenant Activity page left with analytics** (it read only ClickHouse); no activity view until
  analytics is ported back.
- **Compose is five containers, one Redis, no pooler.**
- **A permission key leaves with its last procedure** — §28 fails on a key nothing asserts.
- **Open code questions from the docs sweep:** nothing reads `platform_policy.replica_reads_enabled`,
  so `doc.fn.ts` always asks for the replica; and the `UnavailableError` page says domain code never
  raises it, but the search use-case does.

## How to cut or port a slice

1. Delete the slice's own files (`git ls-files | grep` for its names; keep `docs/scale/<slice>.md`).
2. Fix references **bottom-up in layer order**: permissions → contracts → content → application →
   infrastructure → composition → auth / api-server → api-client → query → feature → apps.
3. **Rebuild before typechecking downstream:** `pnpm --filter "@loadbearing/<pkg>^..." run build` —
   `tsc` resolves workspace packages from `dist/`, so a stale build hides errors (`application` once
   "passed" while importing two removed types).
4. Where a spec used the slice *as an example* of a general property, re-point it at a remaining table
   or module (notifications, docs, `activity_log`, the `doc` module); delete only specs of the slice
   itself.
5. `pnpm -r --no-bail run test` — plain `pnpm test` hides later failures.
6. Repoint docs links to removed files: a link becomes a GitHub URL at `3fafa78c`, a backticked path
   gains `upstream:` (rewrite the old scratch script as a tooling script when needed).
7. `pnpm exec biome check --write .`, then commit one step.

## Traps that cost time

- **A database migrated before the squash cannot take the baseline** — its drizzle journal names the
  old 52 migrations. `pnpm infra:reset`, then `pnpm infra:up && pnpm db:migrate && pnpm db:seed`.
- **`.env.example` ships `AUTH_SECRET=change-me`**, which the schema refuses (32 characters), so `/`
  answers 500.
- **`boot-smoke.mjs` reads no `.env`** (CI passes the environment); locally
  `node --env-file=.env tooling/scripts/boot-smoke.mjs <worker|web|realtime>` after each app's build.
  `pnpm smoke` does read `.env`.
- **An old stack with a `redis-cache` container** holds port 26379; recreate with
  `node tooling/scripts/compose.mjs up -d --remove-orphans`.
- **Docker Desktop can hang mid-run** — `docker ps` never returns and Postgres accepts connections
  without answering, surfacing as timeouts everywhere (composition health specs included). Restart
  Docker, `pnpm infra:up`, rerun.
- **The partition DDL generator validates table names against the allowlist**, so a removed table fails
  its specs even as a string; `partition-ddl.spec.ts` uses `notifications` (two-level) and
  `doc_spaces` (tenant only).
- **`tooling/scripts` may end with `Timeout calling "onTaskUpdate"`** though every test passes (`BL.1`;
  seen on Windows, not Linux).
- **No AI or co-author trailer in commits** — `docs/ai/rules/workflow.md` wins over any tool default.
