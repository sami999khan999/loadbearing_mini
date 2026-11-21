---
title: Files
description: Kebab-case everywhere, the closed set of role suffixes, one class per file, where tests go.
---

# Files

- **Kebab-case everywhere**, components included: `task-card.tsx` exports `TaskCard`.
- **One class per file, named from the class:** strip the role suffix, kebab-case, append
  `.<role>.ts` — `ReactivateTaskUseCase` → `reactivate-task.use-case.ts`.
- **A file with an architectural role is `<subject>.<role>.ts`, and the suffix set is closed** —
  a new one is a decision recorded in `docs/opinions/files.md`.
  Server: `.contract` `.entity` `.procedures` `.use-case` `.repository` `.gateway` `.store`
  `.reader` `.logger` `.provider` `.publisher` `.resolver` `.projector` `.sender` `.mailer`
  `.source` `.unit-of-work` `.connection` `.cache` `.hasher` `.builder` `.factory` `.seed`
  `.enroller` `.founder` `.claimer` `.rules` `.renderer` `.subscriber` `.policy` `.strategy`
  `.plugin` `.router` `.interceptor` `.consumer` `.schedule` `.error` `.schema` `.config`
  `.manifest`. Catalog fragments: `.permissions` `.errors` `.events` `.actions` `.gate` `.routes`
  `.flags` `.widgets` `.data`. Client: `.form` `.list` `.panel` `.button` `.notice` `.setup`
  `.inspector` `.guard` `.context` `.client` `.queries` `.mutations` `.fn` `.server`. And `.spec`.
- **Only the role takes the dot; technology joins with a hyphen:** `redis-cache.store.ts`, never
  `redis.cache-store.ts` (that spells the role `cache-store`, and `*.store.ts` misses it).
- **No layer role → plain kebab-case:** `permission-registry.ts`, `clock.ts`.
- **Two exemptions to subject-first:** use-cases lead with the verb (`reactivate-task.use-case.ts`);
  implementations lead with the technology (`pg-vector.store.ts`, `loki-log.reader.ts`).
- **Framework-dictated filenames win.** In `apps/web/src/route/` TanStack's conventions apply — a
  `-` prefix marks a file as *not* a route.
- **Banned:** `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`. A barrel re-exports, never holds logic.
- **Tests mirror `src/` and never live in it:** `src/error/app.error.ts` →
  `tests/error/app.error.spec.ts`. `*.stories.tsx` is not a test and stays in `src/`.
- **Only `infrastructure` organises `tests/` by subject** (`tests/rbac/`, `tests/messaging/`,
  `tests/cold/`), since specs like `tenant-cascade.spec.ts` mirror no single file. Vendor folders
  stay where the adapter is the subject (`tests/redis/`, `tests/smtp/`).

Argument: [`docs/opinions/files.md`](../../opinions/files.md).
