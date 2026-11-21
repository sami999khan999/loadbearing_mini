---
title: Infrastructure (the real adapters)
description: The real adapters (Postgres, Redis, S3, BullMQ, SMTP, AI providers), the database schema, migrations and admin scripts.
---

# Infrastructure (the real adapters)

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The real implementations of the ports, organised by vendor: `pg/` (Postgres through Drizzle: schema, repositories, transactions, seeds), `redis/`, `s3/`, `bullmq/`, `smtp/`, `openai/`, `gemini/`, and `unified/` (the Markdown renderer). Swapping a vendor means replacing one folder.

It also owns the database: the schema files, the migrations, and the scripts above `src/` that you run by hand (`migrate.ts`, `seed.ts`, `platform-grant.ts`, `partitions.ts` and others). Its tests run against a real Postgres, Redis and MinIO.

| | |
|---|---|
| Folder | `packages/infrastructure/` |
| Files | 185 |
| Uses | [Application (the business logic)](application.md), [Content](content.md), [Contracts](contracts.md), [Core](core.md), [Errors](errors.md), [Observability](observability.md), [Permissions](permissions.md) |
| Used by | [Auth](auth.md), [Composition (the wiring)](composition.md), [The worker](app-worker.md) |

## Every file

### `packages/infrastructure/`

| File | What it does |
|---|---|
| `ai-reindex.ts` | `pnpm ai:reindex`: after the AI provider or model changes, queues one re-embed job per organization. The worker re-embeds that organization's out-of-date chunks. |
| `doc-bench.ts` | `pnpm doc:bench`: creates a 2,000-page public doc space and measures how fast a running web server serves it, against fixed time budgets. |
| `doc-rerender.ts` | `pnpm doc:rerender`: after the Markdown renderer changes, queues one job per organization to re-render its published pages. |
| `drizzle.config.ts` | Settings for drizzle-kit, the tool that generates database migrations from the schema files and opens Drizzle Studio. Reads the database URL from `.env`. |
| `highlight-js.d.ts` | A small type stand-in for the code highlighting library, so its browser types do not leak into this server package. |
| `migrate.ts` | `pnpm db:migrate`: applies every pending migration to every database node (catalog first), then creates each organization's table partitions. |
| `package.json` | Package manifest. |
| `partition-ddl.ts` | The second half of `pnpm db:generate`. Drizzle cannot write `PARTITION BY`, so this rewrites the generated migration to add it. |
| `partitions.ts` | `pnpm db:partitions`: creates the current and next two months' partitions by hand, for when the worker's monthly job did not run. `--sweep` cleans up a deleted organization's cold storage. |
| `platform-grant.ts` | `pnpm platform:grant <email>`: makes an existing user the first super admin by adding them to the platform organization with the `platform_admin` role. Later admins are invited from the app. |
| `queue-control.ts` | `pnpm queue:status`, `queue:pause <queue\|all>` and `queue:resume <queue\|all>`: shows each queue's depth, and pauses or resumes it for every worker. The pause survives restarts. |
| `queue-replay.ts` | `pnpm queue:replay <queue> [job]`: puts failed jobs back on their queue. Failed jobs are kept for a week. |
| `seed.ts` | `pnpm db:seed`: creates the starting data: the `loadbearing` organization (marked as the platform organization), its partitions, the system roles and the platform admin role. Safe to run again. |
| `shard-env.ts` | Reads the database node URLs (`DATABASE_SHARD_<n>_URL`) for the command-line scripts. With none set there is one node. |
| `tsconfig.json` | TypeScript settings, including the scripts that sit above `src/` so they are type-checked too. |
| `tsup.config.ts` | Build settings. |
| `vitest.config.ts` | Test runner settings. Loads the root `.env`, resolves sibling packages to their source, and leaves out the smoke tests. |
| `vitest.smoke.config.ts` | Settings for `pnpm smoke`: runs the smoke tests serially against the live Docker stack, passing them its connection details. |

### `packages/infrastructure/src/`

| File | What it does |
|---|---|
| `import.ts` | Outside-import surface. |
| `index.ts` | Public entry point. |

### `packages/infrastructure/src/bullmq/`

| File | What it does |
|---|---|
| `bullmq-queue.publisher.ts` | `BullMqQueuePublisher`: puts jobs on Redis queues with BullMQ. Retries with growing delays for about ten minutes, and keeps failed jobs for a week so they can be replayed. |
| `index.ts` | Folder barrel. |

### `packages/infrastructure/src/gemini/`

| File | What it does |
|---|---|
| `gemini-embedding.provider.ts` | `GeminiEmbeddingProvider`: turns text into vectors with Google Gemini's API, sized to match OpenAI's so either can fill the same column. |
| `index.ts` | Folder barrel. |

### `packages/infrastructure/src/openai/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `openai-embedding.provider.ts` | `OpenAiEmbeddingProvider`: turns text into vectors with OpenAI's API, in batches, with timeouts, and refuses a reply with the wrong number of vectors. |

### `packages/infrastructure/src/pg/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |

### `packages/infrastructure/src/pg/primitive/`

| File | What it does |
|---|---|
| `base.repository.ts` | `BaseRepository`: the base every Postgres repository extends. Each declares where its tables live (catalog, local or routed) and gets the right connection: the open transaction if there is one, or the right node's pool. Using a catalog repository inside a routed transaction throws. |
| `database-cluster.ts` | `DatabaseCluster`: every database node the app talks to, each with a pooled connection, a direct one for schema changes, and an optional read-only copy. Picks the node for an organization. The small kit runs one node. |
| `database.ts` | `Database`: one Postgres connection pool wrapped for Drizzle, with a hook that counts statements (tests use it to assert query counts). |
| `index.ts` | Folder barrel. |
| `keyset-cursor.ts` | `KeysetCursor`: encodes and decodes the opaque "next page" cursor (time plus ID) used by big lists. A broken cursor is a validation error, never a silent first page. |

### `packages/infrastructure/src/pg/repository/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `pg-account.repository.ts` | Postgres version of the account repository: one person's memberships, suspension and platform denies across all organizations. |
| `pg-activity.logger.ts` | `PgActivityLogger`: writes audit rows inside the open transaction. If the organization lives on another node, it sends the row there through the outbox instead. |
| `pg-api-key.repository.ts` | Postgres version of the API key repository. The lookup by key prefix is the one read that runs before the organization is known. |
| `pg-bootstrap-membership.enroller.ts` | For the `bootstrap` sign-up mode: puts a new user into the one configured organization (the first as owner, the rest as members), with a lock so two sign-ups cannot race. |
| `pg-capability.repository.ts` | Postgres version of the capability repository: reads a person's role grants, goal grants, overrides and the plan in four queries, then resolves their permissions. |
| `pg-doc-grant.repository.ts` | Postgres version of the doc grant repository, including resolving a typed organization, email or plan. |
| `pg-doc-page.repository.ts` | Postgres version of the doc page repository: the tree, drafts, publishing, revisions, search sections and full-text search. |
| `pg-doc-space.repository.ts` | Postgres version of the doc space repository. Sidebar reads may go to the read-only copy. |
| `pg-entitlement.repository.ts` | Postgres version of the entitlement repository: plans, adjustments and module switches. |
| `pg-flag.repository.ts` | Postgres version of the flag repository. Reads every flag and target in one statement. |
| `pg-invitation.claimer.ts` | `PgInvitationClaimer`: when someone signs up or in with an invited email, turns the invitation into a membership. Checks the verified email matches and locks so it cannot race enrolment. |
| `pg-invitation.repository.ts` | Postgres version of the invitation repository (the admin side: list, save, revoke). |
| `pg-maintenance.gateway.ts` | Postgres version of the maintenance gateway: sweeps expired sessions, tokens and invitations, creates future partitions for every organization, estimates partition sizes, and finds leftovers from deleted organizations. |
| `pg-member.repository.ts` | Postgres version of the member repository. A page of members in two queries, whatever its size. |
| `pg-membership.reader.ts` | `PgMembershipReader`: which organizations a user belongs to and their role in each, used by sign-in and the organization switcher. |
| `pg-notification-preference.repository.ts` | Postgres version of the notification preference repository. |
| `pg-notification-recipient.reader.ts` | Postgres version of the recipient reader: members holding a permission, or members of a conversation, a page at a time. |
| `pg-notification.repository.ts` | Postgres version of the notification repository, with bulk inserts that ignore duplicates. |
| `pg-organization.founder.ts` | `PgOrganizationFounder`: creates a new organization with its partitions, seeds its roles and makes the founder its owner, in one transaction. |
| `pg-organization.reader.ts` | Walks every organization a page at a time, optionally only those on one node. |
| `pg-outbox.gateway.ts` | Postgres version of the outbox gateway: claims unsent events with a lease, hands them on, marks them sent. |
| `pg-outbox.publisher.ts` | `PgOutboxPublisher`: writes a domain event to the outbox table inside the open transaction. |
| `pg-partition-archive.gateway.ts` | Postgres version of the archive gateway. Streams each table of an organization being deleted out to S3 as compressed NDJSON, verified and recorded, so it can be recovered for 30 days. Also exports a whole organization and sweeps deleted organizations' files. |
| `pg-permission-override.repository.ts` | Postgres version of the override repository. A platform deny is kept separate from the organization's own rows. |
| `pg-personal-organization.enroller.ts` | For the `personal` sign-up mode: gives each new user an organization of their own, so a fresh install needs no seed or invitation. |
| `pg-platform-policy.repository.ts` | Postgres version of the platform policy repository (the single row of deployment-wide switches). |
| `pg-platform.reader.ts` | Finds the platform organization and remembers it for the life of the process. |
| `pg-role.repository.ts` | Postgres version of the role repository. A page of roles with their grants in three queries. |
| `pg-shard-map.reader.ts` | Reads the node directory for the shard map screen. |
| `pg-shard.resolver.ts` | `PgShardResolver`: answers which node an organization lives on (and whether it is mid-move), cached for a long time and cleared when a move happens. |
| `pg-tenant.repository.ts` | Finds an organization row and deletes it with its remaining catalog rows. |
| `pg-user.reader.ts` | Looks up display names for user IDs, limited to members of the organization. |
| `pg-vector.store.ts` | `PgVectorStore`: stores document chunks and their vectors in Postgres with pgvector, and searches by similarity with a minimum score, or by full text when no AI provider is set. |

### `packages/infrastructure/src/pg/schema/`

| File | What it does |
|---|---|
| `activity.schema.ts` | The `activity_log` table (the audit trail), split by organization and then by month. |
| `api-key.schema.ts` | The `api_keys` table: name, prefix, digest, permissions, expiry, revocation. Never the key itself. |
| `archive.schema.ts` | The `partition_archive` table: one row per archived organization-month per table, with where it went, its size, row count and checksum. |
| `auth.schema.ts` | The sign-in tables Better Auth uses: users, sessions, accounts (password or Google), verifications and two-factor secrets. |
| `doc-grant.schema.ts` | The `doc_space_grants` table: who outside the platform may read a granted doc space (exactly one organization, user or plan per row). |
| `doc.schema.ts` | The four docs tables: `doc_spaces` (with its ready-made sidebar), `doc_pages` (draft and published copy in one row), `doc_revision` (every published version, split by month) and `doc_sections` (the full-text search index, one row per heading). |
| `entitlement.schema.ts` | The `entitlement_adjustments` (per-organization extras or removals) and `disabled_modules` (kill switches) tables. |
| `flag.schema.ts` | The `feature_flags` and `feature_flag_organizations` tables. A missing row means off. |
| `index.ts` | Re-exports every table, because Drizzle needs one list of the whole schema. |
| `invitation.schema.ts` | The `invitations` table: pending invitations only, keyed by the token's digest. |
| `notification.schema.ts` | The `notifications` (split by organization and month) and `notification_preferences` tables. |
| `outbox.schema.ts` | The `outbox_event` table: domain events waiting to be sent by the worker, split by month. |
| `platform.schema.ts` | The platform policy tables: retention per table and per organization, analytics projection per action, and the single row of deployment-wide switches. |
| `rbac.schema.ts` | The access tables: plans and their permissions, organizations, roles and their permissions, memberships, goal members and per-person overrides. |
| `shard.schema.ts` | The `shard_assignments` (which node each organization is on) and `spare_tenants` (pre-made partitions for fast signups) tables. |
| `vector.schema.ts` | The `document_chunks` table: text chunks and their vectors, and the AI model that made each vector, split by organization. |

### `packages/infrastructure/src/pg/seed/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `platform-role.seed.ts` | `PlatformRoleSeed`: creates or updates the `platform_admin` role in the platform organization, holding every platform and organization permission. |
| `system-role.seed.ts` | `SystemRoleSeed`: creates or updates the four built-in roles every organization gets (owner, admin, member, guest) and their permissions. |
| `tenant-partition.seed.ts` | `TenantPartitionSeed`: creates (or drops) an organization's partitions in every partitioned table, with the current and next two months. |

### `packages/infrastructure/src/pg/transaction/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `pg-unit-of-work.ts` | `PgUnitOfWork`: runs work in one Postgres transaction. Nested calls share it, the move freeze is enforced here, and an optional longer timeout is set inside it. |
| `shard-scope.ts` | `ShardScope`: remembers, for the current request or job, which organization and node it runs against, so repositories pick the right pool. |
| `transaction-scope.ts` | `TransactionScope`: remembers the open transaction (and its placement) for the current request, so every repository joins it. |

### `packages/infrastructure/src/redis/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `realtime-log.ts` | `RealtimeLog`: keeps the last few live messages per channel in Redis, so a tab that reconnects is sent what it missed instead of refetching everything. |
| `redis-cache.store.ts` | `RedisCacheStore`: the cache, in Redis. A corrupt entry counts as a miss, and every key has an expiry. |
| `redis-rate-limit.store.ts` | `RedisRateLimitStore`: a counter per key that resets after a fixed window, in Redis. |
| `redis-realtime.publisher.ts` | `RedisRealtimePublisher`: publishes a live message to a Redis channel and appends it to the channel's short log. |
| `redis-realtime.subscriber.ts` | `RedisRealtimeSubscriber`: one Redis subscription connection per process, shared by every open stream, with a bounded queue per stream and replay on reconnect. |
| `redis.connection.ts` | `RedisConnection`: opens the Redis clients by role: cache, queue and realtime. In the small kit all three point at the one Redis, which never evicts, so every cache key carries an expiry. |

### `packages/infrastructure/src/s3/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `s3-client.factory.ts` | `S3ClientFactory`: builds the S3 client with connection and inactivity timeouts, shared by both storage gateways. |
| `s3-storage-policy.gateway.ts` | `S3StoragePolicyGateway`: reads and writes the bucket's lifecycle rules (when objects are deleted). |
| `s3-storage.gateway.ts` | `S3StorageGateway`: file storage on S3 or MinIO: upload, download, delete, list, signed URLs and streamed transfers with checksums. |
| `storage-key.ts` | `StorageKey`: builds storage keys as `<subject>/<yyyy>/<mm>/<uuid>.<ext>`, never using the uploaded file's name. |

### `packages/infrastructure/src/smtp/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `smtp-email.sender.ts` | `SmtpEmailSender`: sends email over SMTP with a connection pool. Mailpit locally, a real provider in production. |

### `packages/infrastructure/src/unified/`

| File | What it does |
|---|---|
| `index.ts` | Folder barrel. |
| `unified-markdown.renderer.ts` | `UnifiedMarkdownRenderer`: turns doc Markdown into safe HTML. Supports GitHub callouts, code highlighting, tabs, steps, accordions and cards, builds the table of contents and search sections, and strips anything unsafe. |

### `packages/infrastructure/tests/cold/`

| File | What it does |
|---|---|
| `export-keyset.spec.ts` | Tests that the tenant export pages every table on a unique key, so no rows are skipped. |
| `pg-partition-archive.gateway.spec.ts` | Tests archiving, verifying, restoring and failure handling for months of data, against a real database. |
| `sweep-deleted.spec.ts` | Tests that a deleted organization's archived files are removed only after 30 days. |

### `packages/infrastructure/tests/doc/`

| File | What it does |
|---|---|
| `doc-query-plan.spec.ts` | Tests that every docs reader query uses an index, by checking Postgres's query plans. |
| `pg-doc-page.repository.spec.ts` | Tests the doc page repository against a real database. |
| `unified-markdown.renderer.spec.ts` | Tests the Markdown renderer, especially that unsafe HTML never gets through. |

### `packages/infrastructure/tests/gemini/`

| File | What it does |
|---|---|
| `gemini-embedding.provider.spec.ts` | Tests the Gemini embedding provider. |

### `packages/infrastructure/tests/maintenance/`

| File | What it does |
|---|---|
| `orphaned-tenants.spec.ts` | Tests the nightly check that finds rows left behind by deleted organizations. |
| `pg-maintenance.gateway.spec.ts` | Tests sweeping expired rows and creating and dropping partitions. |
| `tenant-partition.spec.ts` | Tests creating and dropping an organization's partitions with data in them. |

### `packages/infrastructure/tests/member/`

| File | What it does |
|---|---|
| `pg-invitation.repository.spec.ts` | Tests the invitation repository against a real database. |
| `pg-member.repository.spec.ts` | Tests the member repository, including the two-query limit. |

### `packages/infrastructure/tests/notification/`

| File | What it does |
|---|---|
| `pg-notification.repository.spec.ts` | Tests the notification repository against a real database. |

### `packages/infrastructure/tests/openai/`

| File | What it does |
|---|---|
| `openai-embedding.provider.spec.ts` | Tests the OpenAI embedding provider, including out-of-order and short replies. |

### `packages/infrastructure/tests/outbox/`

| File | What it does |
|---|---|
| `pg-outbox.spec.ts` | Tests writing, claiming and draining the outbox. |

### `packages/infrastructure/tests/pg/`

| File | What it does |
|---|---|
| `partition-ddl.spec.ts` | Tests rewriting generated migrations to add `PARTITION BY`. |
| `partition-pruning.spec.ts` | Tests that queries on partitioned tables only touch the partitions they need. |

### `packages/infrastructure/tests/platform/`

| File | What it does |
|---|---|
| `pg-account.repository.spec.ts` | Tests the account repository against a real database. |
| `pg-entitlement.repository.spec.ts` | Tests the entitlement repository against a real database. |
| `pg-flag.repository.spec.ts` | Tests the flag repository against a real database. |
| `platform-tier.spec.ts` | Tests the platform organization end to end: seeding, its admin role, and admins acting in customer organizations. |
| `shard-env.spec.ts` | Tests reading the database node URLs from the environment. |
| `shard-map.spec.ts` | Tests the shard map reader. |
| `tenant-directory.spec.ts` | Tests that deleting an organization removes its node directory row. |

### `packages/infrastructure/tests/primitive/`

| File | What it does |
|---|---|
| `database-cluster.spec.ts` | Tests the database cluster's replica fallbacks. |
| `keyset-cursor.spec.ts` | Tests encoding and decoding page cursors. |
| `placement.spec.ts` | Tests the placement tripwire: a repository used against the wrong kind of database throws, even with one node. |

### `packages/infrastructure/tests/rbac/`

| File | What it does |
|---|---|
| `pg-bootstrap-membership.enroller.spec.ts` | Tests the bootstrap sign-up enroller. |
| `pg-capability.repository.spec.ts` | Tests resolving permissions from the database, including the four-query limit. |
| `pg-invitation.claimer.spec.ts` | Tests claiming invitations at sign-up. |
| `pg-membership.reader.spec.ts` | Tests reading a user's memberships. |
| `pg-organization.founder.spec.ts` | Tests founding an organization in one transaction with its audit row. |
| `pg-permission-override.repository.spec.ts` | Tests storing overrides, keeping platform denies separate. |
| `pg-personal-organization.enroller.spec.ts` | Tests the personal sign-up enroller. |
| `pg-role.repository.spec.ts` | Tests the role repository, including stopping at the organization boundary. |
| `pg-user.reader.spec.ts` | Tests looking up names, including deactivated members. |
| `system-role.seed.spec.ts` | Tests seeding an organization's built-in roles, including the number of queries. |
| `tenant-cascade.spec.ts` | Tests that deleting an organization removes every row it owns. |

### `packages/infrastructure/tests/redis/`

| File | What it does |
|---|---|
| `redis-cache.store.spec.ts` | Tests the Redis cache store, including corrupt entries. |
| `redis-realtime.publisher.spec.ts` | Tests the Redis live message publisher. |
| `redis-realtime.subscriber.spec.ts` | Tests the Redis live message subscriber: sharing one connection, queues, overflow and resume. |

### `packages/infrastructure/tests/smoke/`

| File | What it does |
|---|---|
| `fan-out.smoke.spec.ts` | Measures the three notification fan-out patterns against the running stack. |
| `pooled.smoke.spec.ts` | Smoke test through the connection pooler: advisory locks and timeouts behave. |
| `redis.smoke.spec.ts` | Smoke test against a running Redis: cache, rate limits, pub/sub and the live message log. |
| `replica.smoke.spec.ts` | Smoke test against a running read replica: lag is read and reads fall back to the primary. |
| `routed.smoke.spec.ts` | Measures what routing to a node costs per request, and routed writes under load (opt-in). |
| `sharded.smoke.spec.ts` | Smoke test with two database nodes: rows land on the node their organization is assigned to. |
| `storage.smoke.spec.ts` | Smoke test against running MinIO: upload, checksum and signed URLs. |
| `tenant-ceiling.smoke.spec.ts` | Measures how many organizations one database node handles comfortably. |

### `packages/infrastructure/tests/smoke/support/`

| File | What it does |
|---|---|
| `stack.ts` | The running stack's connection details, handed to the smoke tests. |

### `packages/infrastructure/tests/smtp/`

| File | What it does |
|---|---|
| `smtp-email.sender.spec.ts` | Tests the SMTP email sender. |

### `packages/infrastructure/tests/support/`

| File | What it does |
|---|---|
| `database.ts` | Test helper: opens the test database and creates and drops throwaway organizations. |
| `orphan-sweep.ts` | Test setup and teardown that drops partitions left by organizations earlier test runs deleted. |
| `recording.logger.ts` | A logger for tests that keeps every line so a test can check it. |

### `packages/infrastructure/tests/transaction/`

| File | What it does |
|---|---|
| `pg-unit-of-work.spec.ts` | Tests transactions: nesting shares one connection, and a rollback undoes everything inside. |

### `packages/infrastructure/tests/vector/`

| File | What it does |
|---|---|
| `pg-vector.store.spec.ts` | Tests storing and searching document chunks in Postgres. |

### `packages/infrastructure/migrations/`

| File | What it does |
|---|---|
| `0000_lite_baseline.sql` | The small kit's whole database schema in one file: every table, index and partition rule, squashed from the big kit's first 52 migrations. |
| `0001_doc_owner_audience.sql` | Adds an index for finding an author's private (`owner`) doc spaces. |
| `0002_chunk_embedding_model.sql` | Records which AI model wrote each document chunk's vector, so switching models re-embeds instead of mixing vectors. |
| `0003_doc_access.sql` | Adds the access-link column to doc spaces and pages, and the GitHub link to spaces. |

### `packages/infrastructure/migrations/meta/`

| File | What it does |
|---|---|
| `_journal.json` | Drizzle's list of every migration in order. Used to know which have run. |
| `0000_snapshot.json` to `0003_snapshot.json` (4 files) | Drizzle's snapshot of the whole schema after each migration, used to work out the next one. Generated; never edited by hand. |

### `packages/infrastructure/docs/`

| File | What it does |
|---|---|
| `index.md` | Every concrete adapter the system owns, behind a port and confined to one package — Postgres and its schema, Redis, S3, BullMQ, SMTP and the embedding providers. |
| `meta.json` | Sidebar order. |

### `packages/infrastructure/docs/reference/`

| File | What it does |
|---|---|
| `cold-storage.md` | What a tenant delete leaves in the bucket — the tenant-month as the unit, the cold/ prefix, partition_archive as the index, the 30-day window, and the export that shares the writer. |
| `doc-renderer.md` | Markdown to sanitised HTML with unified — the pipeline order and why it matters, what the sanitiser lets through, every directive an author can write, re-rendering after a version bump, and the type stub that keeps the DOM out of this package. |
| `embedding.md` | The three ways lite searches documents — lexical with no provider, OpenAI, or Gemini — how the container picks one, what switching providers does to the corpus, and the trade-offs. |
| `enrollers.md` | The four Postgres adapters that put the first row in memberships — the advisory locks they take, the races those locks are protecting, and why every one of them binds structurally rather than by name. |
| `fan-out.md` | The three patterns that fail before the database does, measured against the running stack — what one change for twenty-five thousand people actually costs, and which of the three is the one to worry about. |
| `meta.json` | Sidebar order. |
| `notification-recipients.md` | Three ways to resolve an audience, the correlated EXISTS that keeps one of them a single statement, and why a list of ids from a routed table is two reads rather than one join. |
| `partitions.md` | Tenant first and month underneath, the allowlist as the whole policy, and pruning measured rather than assumed — what a partitioned table costs and what it buys. |
| `pgvector.md` | Why the vector store starts inside Postgres, what the permission filter has to run on, the score floor — and the ORDER BY that stops the HNSW index being used at all. |
| `realtime.md` | One subscriber connection per process, ref-counted channels, a bounded queue whose overflow is a resync rather than a dropped frame nobody hears about, and the short log a resume is replayed from. |
| `sharding.md` | One key, one node, three placements — how a query finds its database, and the tripwire that makes a single-Postgres deployment reveal every use-case a split would break. |
| `storage-policy.md` | Why a second gateway rather than a method on StorageGateway, why "no configuration" is an error code rather than an empty list, and why the app owns the whole configuration rather than one rule of it. |
| `unit-of-work.md` | Why AsyncLocalStorage rather than a tx parameter, how nesting behaves, and the five-line test that is the only proof the transaction is real. |
