---
title: Vocabulary
description: Permissions, procedures, events, queues, contract members, database objects, env vars, React.
---

# Vocabulary

## Permissions, procedures, events, queues

| Kind | Grammar | Example |
|---|---|---|
| **Permission key** | `<module>.<subject>.<action>[.<qualifier>]`, action **imperative** | `task.reactivate`, `task.update.self` |
| **Procedure path** | `<subject>.<action>`, mirrors the permission it requires | `task.reactivate` |
| **Activity / event name** | `<subject>.<action>`, action **past tense** | `task.reactivated` |
| **Log event code** | `<subject>.<thing>.<state>`, state **past tense** | `queue.job.failed` |
| **Log label** | fixed set, low cardinality | `app`, `env`, `level`, `event_code` |
| **Queue name** | `<domain>.<work>`, noun-ish | `embedding.generate` |
| **Repeatable job key** | `schedule.<name>` | `schedule.overdue-sweep` |
| **Feature flag** | `<slice>.<change>`, the change a kebab noun | `widget.dismissal` |
| **Widget key** | `<module>.<name>`, the module one `PermissionRegistry.modules()` knows | `member.count` |
| **Zone key** | `<page>.<region>` | `dashboard.main` |

**Permissions are imperative because they name a right you hold; activities are past tense because
they record a fact.** `task.reactivate` is a right, `task.reactivated` a fact — the distinction is
what keeps an audit log readable.

- **Qualifiers are closed:** `.self`, `.goal`, `.global`, `.org`. No `.own` or `.mine`.
- **Scopes are closed and a different axis:** `org`, `goal`, `platform`. A qualifier narrows a key
  inside a tenant; a scope says which set holds it. `platform` sits above the tenant, held only via a
  role in the organization marked `is_platform`, and `CapabilitySet.can()` reaches it through a branch
  that consults neither the wildcard nor the `core` exception — see
  [`platform-scope.md`](../../packages/permissions/docs/reference/platform-scope.md).
- **Procedure paths mirror their permission where 1:1, and `ProcedurePermissions` stays explicit
  anyway** — an identity-looking map is what fails closed when a procedure is added without an entry.
- **A flag names a change, a widget a unit, a zone a place.** All are dotted, none is a permission.
  A flag is temporary, so its key says what changes, not what it guards; a widget key leads with its
  owning module; a zone key leads with its page. [Visibility](visibility.md) combines them.
- **A zone, never a surface.** "Surface" already means the `--surface` colour token and a package's
  `index.ts`/`import.ts` import surfaces; names are `ZoneKey`, `<Zone>`, `ui-zone`.
- **REST paths** on `.route({ path })` are kebab-case, plural, braced params matching the contract
  field: `/tasks/{taskId}/reactivate`.
- **Shard words:** a **shard key** places a request (the organization id — the organization *is* the
  shard); a **node** is a physical Postgres (`shard_assignments.node`); a **placement** is where a
  *table* lives (`catalog`, `local` or `routed`, exactly one each); the **directory** is
  `shard_assignments`. No "virtual shard" — nobody needed the extra level.

**A log event is not an activity.** An activity is a business fact a user may read, written to a
partitioned Postgres table in the transaction and kept one to two years; a log event is a diagnostic
an operator reads, written to stdout and Loki and kept thirty days
([`@loadbearing/observability`](../../packages/observability/docs/index.md)). A business fact in
stdout is lost on restart; a diagnostic in Postgres is a retention bill.

**An activity name is a catalog entry, not a string.** `ACTIVITY_ACTIONS` is merged from per-slice
fragments in `packages/contracts/src/catalog/` like `DOMAIN_EVENTS`, and `ActivityLogger.record`
takes its key union — because `projection_policy` holds one row per action, so an undeclared action
has no policy. The two catalogs stay separate: an event carries a payload schema for subscribers, an
activity a label for screens. See [Data and scale](data-and-scale.md).

**A label is not a field.** Only the four labels index a line; `trace_id`, `user_id`, `task_id`,
`organization_id` live in the body, queried after the selector narrows. A label is one stream per
value. `EVENT_CATALOG` is `event_code`'s cardinality budget, plus `error.raised` (its level comes from
the error), so keep codes coarse.

## Error codes

`SCREAMING_SNAKE_CASE`, a closed union — `ERROR_CATALOG` is the whole vocabulary. A code is a fact,
never a sentence: `Error.message` **is** the code, and every user-facing word lives in
`@loadbearing/content` keyed by it.

## Contract members

Every `*Contract` uses the same static names:

| Member | Holds |
|---|---|
| `entity` | the full resource shape |
| `create` | creation input |
| `update` | patch input |
| `listQuery` | filter / pagination input |
| `<verb>` | any domain action's input — `reactivate`, `approve` |

Types follow the schema: `TaskDto` from `entity`, `CreateTaskInput` from `create`. **`Dto` for wire
shapes, `Input` for procedure inputs**, never both.

## Database

| Object | Convention | Example |
|---|---|---|
| Table | `snake_case`, **plural** | `goal_members` |
| Append-only table | `snake_case`, **singular** | `activity_log`, `task_status_history` |
| Partition | `<parent>_<yyyy>_<mm>` | `activity_log_2026_08` |
| Column | `snake_case`, singular | `assignee_id` |
| Tenant column | `organization_id`, on every domain table | `organization_id` |
| Foreign key | `<referenced_singular>_id` | `goal_id` |
| Boolean column | `is_` / `has_` prefix | `is_system` |
| Timestamp column | `<verb>ed_at` | `reactivated_at` |
| Unique index | `<table>_<cols>_uq` | `goal_member_uq` |
| Regular index | `<table>_<cols>_idx` | `goal_member_user_idx` |
| Snapshot table | `<subject>_<grain>` | `goal_risk_daily` (illustrative) |
| Enum values | `snake_case` | `in_progress` |
| Drizzle export | `camelCase` plural, matching the table | `goalMembers` |

- **Zod enums mirror DB values exactly** (`in_progress`, never `IN_PROGRESS`/`InProgress`) — one
  string from Postgres to a `<select>` with no mapping layer.
- **Append-only tables are singular** because each is one log or one history, never joined as a
  collection. `session` is singular only because Better Auth named it.
- **`organization_id` on every domain table, and every unique index on one leads with it**
  (`roles_key_uq` on `(key)` alone blocks two tenants' `owner` roles). `check-architecture.mjs` §9
  holds the table list, so adding to it is a decision. The exceptions:

  | Index | Why it cannot lead with the tenant |
  |---|---|
  | `organizations_slug_uq` | This *is* the tenant table |
  | `organizations_platform_uq` | The same table, partial: at most one row may be the platform tier |
  | `invitations_token_uq` | The landing page and accept endpoint arrive with a token and no tenant |
  | `api_keys_hash_uq` | A key arrives as a bare header; the lookup establishes the organization |
  | the Better Auth tables | Generated against that library's schema |

- **A nullable column in a unique index is not covered by it** — NULLs are distinct, so
  `permission_overrides_uq` on `(user_id, goal_id, permission)` enforced nothing for org-scope rows.
  Use two partial indexes, and check every unique index over a nullable column this way:

  ```sql
  CREATE UNIQUE INDEX … ON permission_overrides (organization_id, user_id, permission)
    WHERE goal_id IS NULL;
  CREATE UNIQUE INDEX … ON permission_overrides (organization_id, user_id, goal_id, permission)
    WHERE goal_id IS NOT NULL;
  ```

- **Spell it `organization`**, never `organisation`.
- **A snapshot name says it is derived** — `goal_risk_daily` is a rollup at a grain, `goal_risks`
  would read as writable. Only a projection consumer writes one, rebuildable from the activity log.
  The kit ships none today (two empty, unread ones left with their port), so this is a naming rule.

## Packages, env, React

- **Packages:** `@loadbearing/<single-lowercase-word>`, scoped by layer, never feature (no
  `@loadbearing/task-contracts`).
- **Env vars:** `SCREAMING_SNAKE_CASE`, prefixed by subsystem (`DATABASE_URL`, `S3_BUCKET`). Where one
  technology serves two purposes, the purpose is the prefix: `REDIS_CACHE_URL` and `REDIS_QUEUE_URL`,
  never `REDIS_URL`, since mixing durabilities loses queued work. Only client-exposed vars carry the
  framework's public prefix. Read once in `apps/*/src/env.ts` and passed down; Biome's `noProcessEnv`
  enforces it elsewhere.
- **Components:** `PascalCase` export in a kebab-case file — `task-card.tsx` exports `TaskCard`.
- **Hooks:** `use<Noun>` (`useCapabilities`). **Props:** `<Component>Props`, same file.
- **Handlers:** props `on<Event>`, implementations `handle<Event>`.
- **Query factories:** `<Subject>Queries` / `<Subject>Mutations` in `@loadbearing/query`, never
  `api-client`.
- **Query keys** mirror the procedure path, params last (`["task", "list", { goalId }]`), never
  hand-written at a call site.
