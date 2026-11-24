---
title: Folders
description: src/ holds index.ts, import.ts, and folders. Role folders by default, subject folders where contents repeat per feature.
---

# Folders

## `src/` holds `index.ts`, `import.ts`, and folders. Nothing else

`index.ts` is what the package gives and `import.ts` is what it takes
([Imports and exports](imports.md)); every other file lives in a folder.

```
packages/errors/src/          packages/permissions/src/     packages/content/src/
├── index.ts                  ├── index.ts                  ├── index.ts
├── catalog/                  ├── capability/               ├── import.ts
├── error/                    ├── catalog/                  ├── message/
├── normalizer/               ├── gate/                     ├── primitive/
└── transport/                ├── registry/                 ├── source/
                              └── route/                    └── translator/
```

**Why closed:** a loose file has no stated kind, so nothing says where the next one goes — "just this
one helper" is how `utils.ts` is born. The cost is accepted: `errors/src/normalizer/` holds one file
and `content/src/translator/translator.ts` stutters, but a one-file folder needs no move at three, and
a rule with no judgement call is never litigated in review.

**An app's root is closed too, except for files the framework resolves by name:** `main.ts` (the
worker entrypoint), `env.ts` (the only place `process.env` is read — `check-architecture` §3 names the
path), and in `apps/web` `router.tsx`, `endpoint.ts` and the generated `route-tree.gen.ts`.
`worker-bootstrap.ts` and `system-principal.ts` sat loose until someone asked what kind of thing they
were; they are `bootstrap/` — what the process assembles before it starts working.

## Every folder has an `index.ts`

So a file can move within a folder without touching an import elsewhere. The barrel names every
symbol it publishes, never `export *`.

**Exempt:** `packages/content/src/message/en/` and `bn/`, reached only by string-literal `import()`
from `message/catalog.ts` — that is what splits them into one chunk per locale × namespace, and a
barrel would let anyone collapse it. **And folders holding no modules:** `asset`'s `icon/svg/`,
`image/file/`, `font/` (`.svg`, `.webp`, `.woff2`, reached via `ImageManifest` and the `exports` map
entries `./font.css`, `./sprite.svg`, `./style.css`) and `ui`'s `style/` tree.

**`ui` splits code from appearance.** `component/` has one folder per exported component; `theme/`
holds the TypeScript that chooses and scopes a theme (registries, `ThemeScope`); `style/` holds
stylesheets only:

- **`token.css`** — type scale, spacing, radii, elevation, motion. Theme-invariant, names no colour.
- **`color/`** — one file per theme, each declaring the same twelve names. Names no component.
- **`base.css` and `markdown/`** — the page, and the HTML the Markdown renderer writes. They declare
  no value of their own; every number and colour is a `var()` into the other two.

A rule that breaks that direction is in the wrong file. Components style themselves with Tailwind.

## Every folder under `docs/` has an `index.md`

Same rule one level up: without an index a reader must guess the entry point, and links to the
folder break when a page moves.

```
docs/index.md                 the trees and what each is for
docs/ai/index.md              the task router
docs/ai/rules/index.md        the rulebook's contents
docs/ai/skills/index.md       the run books
docs/opinions/index.md        these pages
```

**`reference/` folders are exempt on purpose** — `packages/<name>/docs/reference/` and
`docs/infra/reference/` are named in full by their parent `index.md` and ordered by `meta.json`; an
inner index would restate the parent and rot. A folder with no Markdown needs none. Enforced by
`check-architecture.mjs` §13.

## A folder is named after its role, and the vocabulary is shared

**Default: a role folder, named for what kind of thing is inside**, the same name in every package —
so `catalog/` means the same in `errors` and `permissions`.

| Folder | Holds | Used by |
|---|---|---|
| `primitive/` | standalone value types and small classes with no layer role | `core`, `content`, `contracts` |
| `catalog/` | team-owned fragments plus a platform-owned `index.ts` that merges them | `errors`, `permissions`, `contracts` |
| `registry/` | singleton lookup classes over a catalog | `permissions`, `contracts` |
| `capability/` | the resolution algorithm over a registry | `permissions` |
| `error/` | `AppError` subclasses, one per code that carries context | `errors` |
| `normalizer/` | boundary converters — unknown in, known shape out | `errors` |
| `transport/` | protocol mappings; the only place a wire format is named | `errors` |
| `source/` | an abstract seam plus its implementations | `content` |
| `translator/` | interpolation and fallback over a message bundle | `content` |
| `message/` | keyed copy, split by locale and namespace | `content` |
| `media/` | the media-reference seam and its resolvers | `content` |
| `collection/` | repeating editorial records, one subject folder each | `content` |
| `document/` | long-form editorial — a contract and the entity over it | `content` |
| `gate/` | module gates, fragment-per-slice | `permissions` |
| `route/` | declared destinations, fragment-per-slice | `permissions` |
| `flag/` | feature flags, fragment-per-slice, merged by a platform-owned barrel | `permissions` |
| `widget/` | widget declarations, fragment-per-slice, merged by a platform-owned barrel | `permissions` |
| `procedure/` | the merged oRPC contract every slice's `.procedures.ts` feeds | `contracts` |
| `event/` | type-only declarations of what an event carries | `observability` |
| `logger/` | the diagnostic seam and its sinks | `observability` |
| `port/` | abstract classes for cross-cutting infrastructure, zero implementations | `application` |
| `subscriber/` | the durable-reaction seam and the registry over it | `application` |
| `schema/` | every table declaration, plus the barrel drizzle-kit is pointed at | `infrastructure` |
| `transaction/` | the `UnitOfWork` seam and the scope it reads | `infrastructure` |
| `seed/` | the seed classes a script calls, one subject folder each, converging on `DatabaseSeed` | `infrastructure` |
| `script/` | runnable scripts, above `src/`: env in, one class called, result printed | any package |
| `container/` | the DI root and the config shape it takes | `composition` |
| `fake/` | test doubles for ports, one per port, never on the barrel | `composition` |
| `client/` | the outbound transport and the typed client over it | `api-client` |
| `router/` | the inbound transport's router half — the middleware chain and the routers two apps share | `api-server` |
| `key/` | the cache-key vocabulary every slice's queries name | `query` |
| `runtime/` | what an app constructs and every slice consumes | `query` |
| `i18n/` | the React binding for the message catalog | `feature` |
| `rbac/` | screens over the permission catalog, no query of their own | `feature` |
| `icon/` | source SVGs, the generated sprite, and the name union over it | `asset` |
| `image/` | the shipped image files and the closed key union over them | `asset` |
| `font/` | self-hosted font files and the one `@font-face` sheet | `asset` |
| `auth/` | the credential seam — strategies, token storage, the auth SDK wrapper | `api-client` |
| `consumer/` | queue consumers | `apps/worker` |
| `schedule/` | repeatable jobs | `apps/worker` |
| `bootstrap/` | what a process assembles before it starts working | `apps/worker` |
| `supervisor/` | the lanes a worker process runs, and the ceilings on them | `apps/worker` |
| `component/` | one folder per exported React component | `ui` |
| `style/` | stylesheets only, and every one the package ships | `ui`, `apps/web` |

- **Never plural** — `tasks/` beside `task/` is the ambiguity this removes.
- **`flag/` and `widget/` are role folders in `permissions` and subject folders elsewhere**
  (`application/src/flag/` holds the flag repository port and `FlagCache`; the widget slice is
  preferences, `<Widget>` and the inspector). The two meanings never share a package.
- **Adding a name here is a decision.** A name that already means something else is the wrong name.

## Where contents repeat per feature, the folder is the subject

A role folder is wrong when the package has one of each thing *per feature*: twenty schemas beside
twenty repositories means a team owns files in two places. **If contents would repeat per slice,
name the folder after the subject.** It is singular, and **every file in it is prefixed with its
name** — the folder is the subject, the suffix the role.

```
packages/contracts/src/                not:  packages/contracts/src/
├── index.ts                                 ├── contract/
├── import.ts                                │   ├── task.contract.ts
├── task/                                    │   └── goal.contract.ts
│   ├── index.ts                             ├── entity/
│   ├── task.contract.ts                     │   ├── task.entity.ts
│   ├── task.entity.ts                       │   └── goal.entity.ts
│   └── task.procedures.ts                   └── procedure/
├── goal/                                        ├── task.procedures.ts
└── primitive/                                   └── goal.procedures.ts
```

Subject folders repeat across packages by design — `contracts/task/`, `application/task/`,
`query/task/`, `feature/task/`, `web/route/(app)/_authenticated/task/` — so a team's glob is
`packages/*/src/<slice>/**`.

> [!NOTE]
> **`infrastructure` is the exception, because tools demand it.** `drizzle.config.ts` needs one
> barrel naming every table, and `drizzle(pool, { schema })` needs that namespace at runtime for
> Better Auth's adapter. So a slice splits across `pg/schema/task.schema.ts` and
> `pg/repository/pg-task.repository.ts`.

**Which packages are which:**
- **Role-organised** (one of each thing): `core`, `errors`, `permissions`, `observability`,
  `content`, `composition`, `api-client`, `api-server`.
- **Subject-organised** (one per slice): `application`, `query`, `feature`.
- **`ui`:** one folder per exported component, under `component/`.
- **`infrastructure`: by vendor** — `pg/`, `redis/`, `s3/`, `bullmq/`, `openai/`, `clickhouse/`,
  `loki/`, files named after the technology too, so `rm -r src/clickhouse/` is a complete swap. It
  once named capabilities (`cache/`, `storage/`, `analytics/`…), which broke at the first second
  implementation: two `analytics/` folders read as two things when they are two implementations of
  one port. It holds only vendors the code **imports** — a log platform that only receives stdout has
  no folder, but reading back over an API is an import, which is why `loki/` holds a reader and no
  writer.
- **`contracts` is both**: one each of `primitive/`, `procedure/`, `catalog/`, `registry/` as role
  folders, and one subject folder per slice. Each folder answered the question on its own.

**Not slices:** `PgVectorStore` and `PgActivityReplayReader` are infrastructure, in `pg/repository/`.
**Repository ports live in the slice**, not `application/src/port/`. **The test for `port/` is what a
new feature adds:** `ActivityReplayReader` looks slice-shaped (`since`, `dailyCounts`) but a second
feature adds a *method*, so it is in `port/`; `TaskRepository` is one per feature, so it lives with
its subject.

## Build-time artefacts and runnable scripts sit above `src/`

`drizzle.config.ts` and `migrations/` are not shipped code, and `src/` is the shipped surface.

**Runnable scripts too — because a script inside a folder runs when its barrel is imported.** When
`PgPersonalOrganizationEnroller` needed `SystemRoleSeed` and the seed was `src/pg/seed/index.ts`,
importing the class connected to Postgres and called `process.exit` mid-sign-in. So the scripts
sit outside `src/`, named for what they do, and the classes they use stay importable in `src/`.

**And they sit in `script/`, never loose at the package root.** They began there, and
`infrastructure`'s root reached fifteen of them beside its configs before anyone could say which
file was which kind. `script/` names the kind once:

```
packages/infrastructure/
├── package.json  tsconfig.json  *.config.ts     manifest and tool configs
├── migrations/  clickhouse-migrations/          build-time artefacts
├── script/                                      runnable: seed-dev.ts, migrate.ts, …
├── src/  tests/  docs/
```

A package or app root holds its manifest, tool configs (`*.config.*`, `vitest.setup.ts`), type
shims (`*.d.ts`) and folders; `apps/web/cluster.mjs`, the production entry, is the one named
exception. `check-architecture` §26 fails on any other loose script, and on a `script/` the
package's `tsconfig` does not include. That also keeps `process.env` and `console.log` out of
`src/`: the lint exemption is one glob over `script/`, never a glob over library code.

**A script stays thin.** It reads the environment and argv, opens what it needs, calls a class in
`src/` and prints the result. `pnpm seed:dev` and `pnpm seed:prod` are two such scripts over one
class, `DatabaseSeed` in `src/pg/seed/`, whose `dev()` and `prod()` run the subject folders under it
(`platform/`, `tenant/`, `system/`, `doc/`, `admin/`).
