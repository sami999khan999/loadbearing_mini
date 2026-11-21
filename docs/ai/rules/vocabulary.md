---
title: Vocabulary
description: Seven grammars that look alike and mean different things, plus the naming rules whose violation is silent.
---

# Vocabulary

Seven look-alike vocabularies. Tense is the silent failure: a permission is a right you hold, an
activity is a fact that happened.

| Kind | Grammar | Example |
|---|---|---|
| Permission key | `<module>.<subject>.<action>`, **imperative** | `task.reactivate` |
| Procedure path | `<subject>.<action>`, mirrors its permission | `task.reactivate` |
| Activity / event name | `<subject>.<action>`, **past tense** | `task.reactivated` |
| Log event code | `<subject>.<thing>.<state>`, **past tense** | `queue.job.failed` |
| Feature flag | `<slice>.<change>`, a kebab noun | `widget.dismissal` |
| Widget key | `<module>.<name>`, `<module>` a real module | `member.count` |
| Zone key | `<page>.<region>` | `dashboard.main` |

- **A zone, never a "surface"** (that is a colour token and an import surface): `ZoneKey`,
  `<Zone>`, `ui-zone`.
- **Qualifiers are closed:** `.self`, `.goal`, `.global`, `.org`. Never `.own`/`.mine`.
- **Scopes are closed and a different axis:** `org`, `goal`, `platform`. `platform` is held only via
  a role in the organization marked `is_platform`; no tenant wildcard reaches it.
- **An activity is not a log event.** Business facts go to Postgres; diagnostics to stdout.
- **Log labels are exactly four:** `app`, `env`, `level`, `event_code`. `trace_id`, `user_id`,
  `organization_id` go in the body — a high-cardinality label makes one stream per value.
- **Error codes are `SCREAMING_SNAKE_CASE`, a closed union.** `Error.message` is the code; every
  user-facing word is in `@loadbearing/content`. `Record<ErrorCode, ShellMessageKey>` will not
  compile without copy.
- **`organization_id` on every domain table, and every unique index on one leads with it**
  (`roles_key_uq` on `(key)` alone blocks two tenants' `owner` roles). Exceptions: the tenant table,
  `invitations_token_uq`, `api_keys_hash_uq`, Better Auth's tables. CI-asserted. Spell it
  `organization`, never `organisation`.
- **A nullable column is not covered by a unique index** (NULLs are distinct) — use two partial
  indexes split on `IS NULL` / `IS NOT NULL`.
- **Tables are `snake_case` plural; append-only tables singular** (`activity_log`). **Zod enums
  mirror DB enum values exactly** — `in_progress`, never `IN_PROGRESS`.
- **Env vars are named by purpose, not technology:** `REDIS_CACHE_URL` and `REDIS_QUEUE_URL`, never
  one `REDIS_URL`. Read once in `apps/*/src/env.ts` and passed down; `process.env` appears nowhere
  else.

Full tables — database objects, React, contract members, query keys — and the argument:
[`docs/opinions/vocabulary.md`](../../opinions/vocabulary.md).
