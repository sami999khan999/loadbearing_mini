---
title: The codebase, file by file
description: Every package and app in the repository, what each one is for, and a page per package describing every file in plain words.
---

# The codebase, file by file

> Part of [the plain-language guide](../index.md). For how the parts work together, read
> [How everything works](../architecture.md) first.

This guide covers all 1640 tracked files in the small kit (loadbearing lite).
There is one page per package or app, in the order the layers depend on each other: each package
may only use the ones above it in this list. Each page starts with what the package is for, then
lists every file, folder by folder, with one or two plain sentences on what it does.

## The pages

| Page | Folder | Files | What it is |
|---|---|---|---|
| [The repository root](root.md) | the top level | 26 | Settings files at the top, CI, git hooks, the Docker stack in `infra/`. |
| [The docs folder](docs.md) | `docs/` | 97 | The written rules, the arguments behind them, the build order, the running stack, the plans and the way back to the big kit. |
| [Tooling](tooling.md) | `tooling/` | 81 | Shared TypeScript, Biome and ESLint settings, and the repository's own check scripts. |
| [Errors](errors.md) | `packages/errors/` | 35 | One error shape for the whole system: a code and details, never a sentence. |
| [Core](core.md) | `packages/core/` | 25 | Tiny shared building blocks: clock, Result, IDs, tokens, and the server-only tripwire. |
| [Permissions](permissions.md) | `packages/permissions/` | 53 | Every permission, menu gate, URL and flag and the yes-or-no logic, shared by server and browser. |
| [Observability](observability.md) | `packages/observability/` | 30 | Logging: closed event codes, levels, redaction and trace IDs, written as JSON. |
| [Contracts](contracts.md) | `packages/contracts/` | 95 | Every API endpoint's shape, the ID types, event and audit names, and the endpoint-to-permission map. |
| [Assets](asset.md) | `packages/asset/` | 42 | Icons, images and fonts, compiled for the browser. |
| [Content](content.md) | `packages/content/` | 70 | Every word users read, in English and Bengali, plus the menu entries. |
| [Application (the business logic)](application.md) | `packages/application/` | 248 | The business logic: one use-case per action, talking to the outside world only through ports. |
| [Infrastructure (the real adapters)](infrastructure.md) | `packages/infrastructure/` | 185 | The real adapters (Postgres, Redis, S3, BullMQ, SMTP, AI providers), the database schema, migrations and admin scripts. |
| [Auth](auth.md) | `packages/auth/` | 51 | Sign-in with Better Auth, and turning any credential into a Principal. |
| [Composition (the wiring)](composition.md) | `packages/composition/` | 63 | The Container that wires every adapter and use-case together, plus the test fakes. |
| [API server](api-server.md) | `packages/api-server/` | 19 | The middleware chain every API call passes through, and the live-stream router. |
| [UI (the design system)](ui.md) | `packages/ui/` | 127 | The design system: components, the twelve colours, six themes and every stylesheet. |
| [API client](api-client.md) | `packages/api-client/` | 29 | The typed API client and the sign-in client wrappers. |
| [Query (data fetching and caching)](query.md) | `packages/query/` | 67 | Cached reads and writes for React with TanStack Query, and the live stream in the browser. |
| [Feature (the screens' building blocks)](feature.md) | `packages/feature/` | 131 | The screens' building blocks: forms, lists and panels for every feature. |
| [The web app](app-web.md) | `apps/web/` | 109 | The website and API server: every page, the API, sign-in and the public docs. |
| [The worker](app-worker.md) | `apps/worker/` | 39 | The background process: queues, email, notifications, indexing and scheduled housekeeping. |
| [The realtime app](app-realtime.md) | `apps/realtime/` | 18 | The process that holds every open live stream and forwards events from Redis. |

## How a package is laid out

Every package and app follows the same shape:

| Path | What lives there |
|---|---|
| `src/` | The code. Only folders, plus `index.ts` and `import.ts`. |
| `src/index.ts` | The package's public entry point. Other packages may only import what it re-exports. |
| `src/import.ts` | Every import from outside the package, written once. The rest of `src/` imports from here. |
| `src/<folder>/index.ts` | A folder index that re-exports the files beside it. |
| `tests/` | The tests. They mirror `src/`: `src/x/y.ts` is tested by `tests/x/y.spec.ts`. |
| `docs/` | The package's own reference pages: why each export is shaped the way it is. |
| `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts` | The manifest, TypeScript settings, build settings and test settings. |

Scripts you run by hand (such as `migrate.ts` and `seed.ts`) sit above `src/`, so importing a folder
can never run them by accident.

## How to read a file name

File names are kebab-case and end in a **role**, so the name says what kind of thing is inside.
`invite-member.use-case.ts` holds `InviteMemberUseCase`.

| Ending | What the file holds |
|---|---|
| `.use-case.ts` | One action the system can take, such as inviting a member. Checks permission first. |
| `.rules.ts` | Business rules several use-cases share. |
| `.policy.ts` | A decision table (for example, who is notified of what). |
| `.repository.ts` | Storing and loading one kind of record. In `application` it is the interface; in `infrastructure`, a `pg-…` file is the Postgres version. |
| `.reader.ts` | Read-only lookups. |
| `.gateway.ts` | Bulk or low-level work against an outside system (archives, maintenance, storage). |
| `.store.ts` | A simple key-value store: a cache, rate-limit counters, vectors. |
| `.publisher.ts`, `.subscriber.ts` | Sends messages, or reacts to them. |
| `.logger.ts` | Writes the audit log or the diagnostic log. |
| `.provider.ts`, `.resolver.ts`, `.renderer.ts`, `.sender.ts`, `.mailer.ts`, `.hasher.ts` | One job each: produce vectors, work something out, render Markdown or email, send email, hash a key. |
| `.unit-of-work.ts` | Runs work inside one database transaction. |
| `.enroller.ts`, `.founder.ts`, `.claimer.ts`, `.seed.ts` | Create starting rows: a first membership, a new organization, a claimed invitation, seeded roles. |
| `.cache.ts` | A cache in front of an expensive read. |
| `.schema.ts` | Database table definitions. |
| `.contract.ts`, `.procedures.ts`, `.entity.ts` | An API area's shapes, its endpoints, and small pure answers about one record. |
| `.permissions.ts`, `.gate.ts`, `.routes.ts`, `.flags.ts`, `.widgets.ts`, `.actions.ts`, `.events.ts`, `.errors.ts` | Pieces of a catalog, one per area, merged in the folder's `index.ts`. |
| `.router.ts` | Connects API endpoints to their use-cases. No logic. |
| `.consumer.ts`, `.schedule.ts` | A worker queue handler, and a scheduled job. |
| `.fn.ts`, `.server.ts` | A TanStack Start server function, and server-only web code. |
| `.queries.ts`, `.mutations.ts` | Cached reads and writes for React. |
| `.form.tsx`, `.list.tsx`, `.panel.tsx`, `.button.tsx`, `.notice.tsx`, `.inspector.tsx`, `.setup.tsx`, `.context.tsx` | Kinds of UI component. |
| `.config.ts`, `.manifest.ts`, `.data.ts` | Settings, a fixed list (for example email templates), static data. |
| `.spec.ts`, `.spec.tsx` | A test. |

A file with no role ending (`clock.ts`, `permission-registry.ts`) is a plain building block.

## Words used on these pages

| Word | Meaning |
|---|---|
| **Organization** (tenant) | A customer account. Every piece of data belongs to exactly one. |
| **Platform organization** | The one organization whose members run the deployment (the super admins). |
| **Principal** | Who is acting, in which organization, with which permissions. Built from a cookie, token, API key or the worker. |
| **Permission**, **capability** | A named right such as `member.invite`. A person's resolved set of them is their capabilities. |
| **Use-case** | One action in the business layer. |
| **Port** | An abstract class saying what the business layer needs, such as "send an email". |
| **Adapter** | A real implementation of a port, such as the SMTP sender. |
| **Container** | The class that creates every adapter and use-case and wires them together. |
| **Partition** | One slice of a big table, per organization and sometimes per month. |
| **Placement** | Whether a table is shared (catalog), on every node (local), or on the organization's own node (routed). |
| **Outbox** | A table where events are written inside a transaction, then sent on by the worker. |
| **Audit log** | `activity_log`: the permanent record of who did what. |
| **Fake** | An in-memory stand-in for an adapter, used in tests. |
