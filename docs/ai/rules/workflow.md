---
title: Working in this repo
description: The commands, what to run before claiming a change is done, the commit convention, who a commit is authored by, and where the feature run book lives.
---

# Working in this repo

```bash
pnpm dev [web|worker|realtime]   # builds packages once, then the apps (all, or one)
pnpm build | typecheck | lint | format | test | clean
pnpm check [architecture|contrast|comments|deps|repo]   # no name: every gate, CI's order
pnpm infra up                     # postgres, redis, minio, mailpit — the whole lite stack;
                                  # then down | reset | logs
pnpm db generate | migrate | studio | partitions
pnpm seed:prod                    # platform organization, its roles, and every docs tree
pnpm seed:dev                     # the same, plus a verified local platform admin
                                  # (ADMIN_EMAIL / ADMIN_PASSWORD, or a printed password)
pnpm smoke [web]                  # wiring check against live containers
pnpm ops <task> [args]            # platform-grant <email> · queue-replay <queue> [job] ·
                                  # queue-status · queue-pause|queue-resume <queue|all> ·
                                  # ai-reindex [--docs] · doc-rerender · doc-bench · auth-tables
```

`tooling/scripts/task.mjs` is the whole table: an unknown task prints the list. Runnable
scripts live in each package's `script/`, never at its root (§26).

- **`db migrate` and `db partitions` walk every node**, catalog first, from `shard-env.ts`'s
  reading of `DATABASE_SHARD_<n>_URL` — node 0 alone in lite, and the loop stays. `db generate`
  and `db studio` stay on the catalog; the seed writes the catalog, then the docs on the platform
  organization's node.
- **Mail goes to Mailpit (`:28025`), never out** — and only while the worker runs, since every
  message is a job on `QueueName.MAIL`.
- Prefer `pnpm --filter @loadbearing/<pkg> run <script>` over `cd`.

## Before you claim a change is done

1. **On a clean clone:** `pnpm build:packages && pnpm --filter @loadbearing/web build` first —
   `apps/web/src/route-tree.gen.ts` is generated and gitignored, and without it every route file
   fails typecheck with an unrelated-looking error.
2. **`pnpm check architecture`.** The barrel check needs `build:packages` and the bundle check needs
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
nothing emits, `.env.example` drift, a script loose at a package root or untypechecked, a host port
stated twice and disagreeing, a permission no procedure asserts, the four `DATABASE_SHARD_<n>_URL`
readers disagreeing, a flag expired or unread, and a colour outside the twelve.

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
