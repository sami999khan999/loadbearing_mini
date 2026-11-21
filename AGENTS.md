# loadbearing lite

A pnpm-workspace starter kit for a smaller project: a TanStack Start web app, a standalone worker
and a stream process that holds every open browser stream, over a layered, port-and-adapter package
graph. Postgres + pgvector on one node, one Redis (cache and queue share it, both env vars kept),
S3, logs to stdout.

**It is the big kit (`loadbearing_tanstack_start_kit`) with the running scale stores removed and
every seam kept** — same packages, `@loadbearing/*` scope and rules. The sha it was cut from is in
[`UPSTREAM.md`](UPSTREAM.md); the way back to each removed piece is in
[`docs/scale/`](docs/scale/index.md); what is left is in
[`docs/plans/BACKLOG.md`](docs/plans/BACKLOG.md).

**Start at [`docs/ai/index.md`](docs/ai/index.md)** — one row per task, naming the rule files that
answer it. The whole rulebook is [`docs/ai/rules/index.md`](docs/ai/rules/index.md): fourteen
files, ~8,200 tokens.

**Do not work from the surrounding code's example.** The conventions are stated; an inferred one
will be wrong in the ways that matter.

The five that cost the most when broken:

- **Dependencies point one way**, and `packages/application` names no framework and never logs.
- **`//` comments only, two lines maximum.** No block comments anywhere, JSX included.
- **Every colour is `var(--<name>)`**, from the twelve `packages/ui` declares.
- **Lite removes stores, never seams.** Tables stay partitioned, repositories keep their shard
  placement, and `REDIS_CACHE_URL` / `REDIS_QUEUE_URL` stay two names. Collapsing a seam because
  one node runs today is the rewrite this kit exists to avoid.
- **Never name yourself as author, co-author, or contributor** — not in a commit message, a pull
  request, or a branch name.

Run `pnpm check:architecture` before claiming a change is done: the assertions that typecheck, lint
and tests all miss.
