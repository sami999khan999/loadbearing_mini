---
title: Composition (the wiring)
description: The Container that wires every adapter and use-case together, plus the test fakes.
---

# Composition (the wiring)

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The one place everything is plugged together. `Container` builds the real database pools, Redis clients, storage, mail, AI provider, every repository and every use-case, from a settings object the app passes in. No framework, no decorators: one hand-written class.

It also ships `TestContainer` and the in-memory fakes (`fake/`), so use-case tests run with no database, and the mail pieces that join the email text to its layout and put each message on the queue.

| | |
|---|---|
| Folder | `packages/composition/` |
| Files | 63 |
| Uses | [Application (the business logic)](application.md), [Auth](auth.md), [Content](content.md), [Contracts](contracts.md), [Core](core.md), [Errors](errors.md), [Infrastructure (the real adapters)](infrastructure.md), [Observability](observability.md), [Permissions](permissions.md) |
| Used by | [API server](api-server.md), [The web app](app-web.md), [The worker](app-worker.md), [The realtime app](app-realtime.md) |

## Every file

### `packages/composition/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/composition/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/composition/src/container/`

| File | What it does |
|---|---|
| `container-health.reader.ts` | `ContainerHealthReader`: the health readings the platform status page shows (database nodes, caches, queues, analytics, replica), read from the container. |
| `container.config.ts` | `ContainerConfig`: every setting the system needs, in one object: database URLs, Redis URLs, S3, mail, AI provider, sign-in, and optional extras. The apps read the environment and pass this in; the container never reads the environment itself. |
| `container.ts` | `Container`: the one place everything is wired together. It creates the real database clusters, Redis clients, S3 gateways, mail sender, AI provider and every repository and use-case, and hands them to the apps. Swapping a vendor means editing this file. The web app, worker and realtime app each build one. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `test-container.ts` | `TestContainer`: builds the same graph from in-memory fakes, so use-case tests run without Postgres, Redis or S3. |

### `packages/composition/src/fake/`

| File | What it does |
|---|---|
| `direct.unit-of-work.ts` | Test fake: runs the work without a transaction and counts calls. |
| `in-memory-cache.store.ts` | Test fake cache: a Map that records each key's expiry. |
| `in-memory-flag.repository.ts` | Test fake for feature flag storage. |
| `in-memory-organization.reader.ts` | Test fake for walking organizations a page at a time. |
| `in-memory-outbox.gateway.ts` | Test fake outbox: rows leave only when the relay succeeds. |
| `in-memory-platform-policy.repository.ts` | Test fake for the deployment-wide switches. |
| `in-memory-rate-limit.store.ts` | Test fake rate-limit counter. |
| `in-memory-realtime.hub.ts` | Test fake that connects the live-stream publisher fake to the subscriber fake. |
| `in-memory-realtime.subscriber.ts` | Test fake live-stream subscriber. |
| `in-memory-shard.resolver.ts` | Test fake node resolver; records cache invalidations. |
| `in-memory-storage-policy.gateway.ts` | Test fake for bucket lifecycle rules. |
| `in-memory-storage.gateway.ts` | Test fake file storage: bytes in a Map, fake signed URLs. |
| `in-memory-tenant-membership.reader.ts` | Test fake membership check: everyone is a member unless told otherwise. |
| `in-memory-user.reader.ts` | Test fake name lookup. |
| `in-memory-vector.store.ts` | Test fake vector store that computes real similarity scores. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `recording-activity.logger.ts` | Test fake audit logger that records every row, so a test can check an action was audited. |
| `recording-capability.invalidator.ts` | Test fake that records every permission cache flush. |
| `recording-domain-event.publisher.ts` | Test fake that records every published domain event. |
| `recording-email.sender.ts` | Test fake that records every email instead of sending it. |
| `recording-mail.publisher.ts` | Test fake that records every mail request, honouring duplicate keys. |
| `recording-maintenance.gateway.ts` | Test fake that records every housekeeping call. |
| `recording-partition-archive.gateway.ts` | Test fake that records archive, restore and export requests. |
| `recording-queue.publisher.ts` | Test fake that records every queued job, honouring job IDs. |
| `recording-realtime.publisher.ts` | Test fake that records every live message and its channel. |
| `recording-relayed-activity.store.ts` | Test fake for relayed audit rows. |
| `recording-session.gateway.ts` | Test fake that records who was signed out. |
| `stub-embedding.provider.ts` | Test fake AI provider: makes stable vectors from the text itself, with no network call. |
| `stub-mail.renderer.ts` | Test fake mail renderer that echoes its inputs. |
| `stub-markdown.renderer.ts` | Test fake Markdown renderer that still finds `##` headings. |
| `stub-session.resolver.ts` | Test fake session resolver. |

### `packages/composition/src/mail/`

| File | What it does |
|---|---|
| `content-mail.renderer.ts` | `ContentMailRenderer`: renders an email: takes the words from the `email` text catalog in the recipient's language and puts them into the mail layout, as text and HTML. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `mail-layout.ts` | `MailLayout`: the HTML and plain-text frame every email uses: heading, paragraphs and a button. The one place allowed literal colours, because email clients ignore CSS variables. |
| `queued-auth.mailer.ts` | `QueuedAuthMailer`: sends Better Auth's emails (verify, reset, two-factor code, change email) by queueing them at high priority. |
| `queued-invitation.mailer.ts` | `QueuedInvitationMailer`: sends invitation emails by queueing them, with the absolute link to the invitation page. |
| `queued-mail.publisher.ts` | `QueuedMailPublisher`: puts a mail job on the mail queue with its priority, retries and a one-day duplicate guard. |

### `packages/composition/src/shard/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `organization.strategy.ts` | `OrganizationShardingStrategy`: decides which database node a request uses: the organization's. Change this file to shard by something else. |

### `packages/composition/tests/container/`

| File | What it does |
|---|---|
| `container.spec.ts` | Tests `container.ts`. |
| `test-container.spec.ts` | Tests `test-container.ts`. |

### `packages/composition/tests/fake/`

| File | What it does |
|---|---|
| `fake.spec.ts` | Tests that the fakes behave like the real adapters in the ways that matter (duplicate guards, rollbacks). |
| `realtime-fake.spec.ts` | Tests the live-stream fakes deliver only on the right channel. |

### `packages/composition/tests/mail/`

| File | What it does |
|---|---|
| `content-mail.renderer.spec.ts` | Tests `content-mail.renderer.ts`. |
| `queued-mail.spec.ts` | Tests queueing mail: priorities, retries and duplicate guards. |

### `packages/composition/tests/support/`

| File | What it does |
|---|---|
| `config.ts` | Test settings for building a real container against the local stack. |

### `packages/composition/docs/`

| File | What it does |
|---|---|
| `index.md` | The hand-written DI root that replaces a framework container. One class, no decorators, no reflection, no module graph — and the only place a vendor swap happens. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/composition/docs/reference/`

| File | What it does |
|---|---|
| `container.md` | The four rules that govern the DI root — abstract types on the public surface, no request state, no process.env, reverse-order disposal — plus where use-cases go and why lazy instantiation is banned. |
| `mail-pipeline.md` | Why every message is a queue job, why auth mail goes through it too, why there is no delivery table, and where the delivery record actually lives. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `test-container.md` | The twenty-two fakes and the harness that wires them — why it returns abstract types, why it lives in src/ rather than tests/, and why query counts belong in the integration tier instead. |
