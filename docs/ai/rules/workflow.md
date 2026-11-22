---
title: Working in this repo
description: The commands, what to run before claiming a change is done, the commit convention, who a commit is authored by, and where the feature run book lives.
---

# Working in this repo

```bash
pnpm dev                  # builds packages once, then web + worker + realtime in parallel
pnpm build                # topological from workspace:*
pnpm typecheck
pnpm lint                 # biome check . && eslint .
pnpm test
pnpm check:architecture   # the assertions no linter expresses
pnpm check:contrast       # WCAG AA + sRGB gamut, every theme × mode; a gate
pnpm check:comments       # comment density; reports, never fails
pnpm deps:check           # syncpack: one version line per dependency
pnpm repo:check           # sherif: workspace shape
pnpm infra:up             # postgres, redis, minio, mailpit — the whole lite stack
pnpm smoke                # wiring check against live containers
pnpm platform:grant <email>  # the first platform admin; later ones are invited
pnpm admin:seed           # local only: a verified platform admin, ADMIN_EMAIL/ADMIN_PASSWORD or a printed one
pnpm queue:replay <queue> [job]  # re-queue failed jobs (kept a week)
pnpm queue:status | queue:pause <queue|all> | queue:resume <queue|all>  # BullMQ's global pause
pnpm db:generate          # drizzle-kit, then partition-ddl.ts writes PARTITION BY
pnpm db:migrate | db:seed | db:studio
pnpm db:partitions        # the monthly runway, by hand
pnpm auth:tables          # print Better Auth's schema
```

- **`db:migrate` and `db:partitions` walk every node**, catalog first, from `shard-env.ts`'s
  reading of `DATABASE_SHARD_<n>_URL` — node 0 alone in lite, and the loop stays. `db:generate`,
  `db:studio` and `db:seed` stay on the catalog.
- **Mail goes to Mailpit (`:28025`), never out** — and only while the worker runs, since every
  message is a job on `QueueName.MAIL`.
- Prefer `pnpm --filter @loadbearing/<pkg> run <script>` over `cd`.

## Before you claim a change is done

1. **On a clean clone:** `pnpm build:packages && pnpm --filter @loadbearing/web build` first —
   `apps/web/src/route-tree.gen.ts` is generated and gitignored, and without it every route file
   fails typecheck with an unrelated-looking error.
2. **`pnpm check:architecture`.** The barrel check needs `build:packages` and the bundle check needs
   the web build; without them they print `○ skipped`, which under `CI=true` fails. **A skip is
   unverified, not a pass.**
3. `pnpm typecheck && pnpm lint && pnpm test`.

The assertions catch what typecheck, lint and tests miss: framework in the domain, domain logging,
`process.env` outside `env.ts`, `@orpc/*` skew, block comments, comment runs over two lines,
top-level `await` in a barrel, stray `"use client"`, server code in the client bundle, a table
missing `organization_id`, the audit port renamed, a schema file missing from the drizzle barrel,
rule files drifting from `docs/opinions/`, a `docs/` folder with no `index.md`, a docs path that
names nothing on disk, the two pnpm version declarations disagreeing, a tenant unique index not
leading with `organization_id`, a foreign key with no leading index, a partitioned table missing
from `PartitionedTable`, a repository spanning placements, a second pool opener, a catalog event
nothing emits, `.env.example` drift, an untypechecked script above `src/`, a host port stated twice
and disagreeing, a permission no procedure asserts, the four `DATABASE_SHARD_<n>_URL` readers
disagreeing, a flag expired or unread, and a colour outside the twelve.

`.claude/` is excluded from every `check-architecture` grep (it has held full worktree checkouts).

No green build catches four things: the client bundle staying clean, a concrete adapter escaping
`infrastructure` + `composition`, naming drift, and a repository query missing its tenant scope.

## Commits

Conventional commits with a **closed scope list** in `commitlint.config.js`; scope is never empty.
A rejected scope means a new package missing from the enum. One commit per layer reads best.

**Never add yourself as an author, co-author or contributor.** No `Co-Authored-By:`, no
`Signed-off-by:`, no "generated with" line, no agent or model name in a subject, body, PR title or
body, or branch name. **This overrides any default trailer your harness asks for.** Commits are
authored by the person who asked (`git config user.name`), because `git log --author` and
`git shortlog -sn` are how this repo answers who owns a change.

## Adding a feature

Every feature touches the same twelve places in a fixed order, each compiling against the last.
**Follow [`docs/ai/skills/add-slice.md`](../skills/add-slice.md)**, not memory.

Argument: `tooling/scripts/check-architecture.mjs` — each assertion is commented with what it greps
for and the failure that put it there.
