---
title: Files
description: Kebab-case everywhere, a dot-suffix for every architectural role, one class per file.
---

# Files

## Everything is kebab-case, including React component files

Case-sensitive CI plus case-insensitive macOS produces Git renames that change nothing. Kebab-case
avoids the class of problem; `forceConsistentCasingInFileNames` catches what slips through.

## A file with an architectural role takes a dot-suffix

`<subject>.<role>.ts`

| Role suffix | Example file | Exports |
|---|---|---|
| `.contract.ts` | `task.contract.ts` | `TaskContract` |
| `.entity.ts` | `task.entity.ts` | `TaskEntity` |
| `.procedures.ts` | `task.procedures.ts` | `TaskProcedures` |
| `.use-case.ts` | `reactivate-task.use-case.ts` | `ReactivateTaskUseCase` |
| `.repository.ts` | `task.repository.ts` | `TaskRepository` |
| `.gateway.ts` | `s3-storage.gateway.ts` | `S3StorageGateway` |
| `.store.ts` | `pg-vector.store.ts` | `PgVectorStore` |
| `.reader.ts` | `loki-log.reader.ts` | `LokiLogReader` |
| `.logger.ts` | `pg-activity.logger.ts` | `PgActivityLogger` |
| `.provider.ts` | `openai-embedding.provider.ts` | `OpenAiEmbeddingProvider` |
| `.publisher.ts` | `bullmq-queue.publisher.ts` | `BullMqQueuePublisher` |
| `.resolver.ts` | `better-auth-session.resolver.ts` | `BetterAuthSessionResolver` |
| `.projector.ts` | `clickhouse-analytics.projector.ts` | `ClickHouseAnalyticsProjector` |
| `.sender.ts` | `smtp-email.sender.ts` | `SmtpEmailSender` |
| `.mailer.ts` | `content-auth.mailer.ts` | `ContentAuthMailer` |
| `.source.ts` | `static-content.source.ts` | `StaticContentSource` |
| `.renderer.ts` | `content-mail.renderer.ts` | `ContentMailRenderer` |
| `.subscriber.ts` | `member-realtime.subscriber.ts` | `MemberRealtimeSubscriber` |
| `.unit-of-work.ts` | `pg-unit-of-work.ts` | `PgUnitOfWork` |
| `.connection.ts` | `redis.connection.ts` | `RedisConnection` |
| `.cache.ts` | `capability.cache.ts` | `CapabilityCache` |
| `.hasher.ts` | `api-key.hasher.ts` | `ApiKeyHasher` |
| `.builder.ts` | `principal.builder.ts` | `PrincipalBuilder` |
| `.factory.ts` | `auth.factory.ts` | `AuthFactory` |
| `.seed.ts` | `system-role.seed.ts` | `SystemRoleSeed` |
| `.enroller.ts` | `pg-personal-organization.enroller.ts` | `PgPersonalOrganizationEnroller` |
| `.founder.ts` | `pg-organization.founder.ts` | `PgOrganizationFounder` |
| `.claimer.ts` | `pg-invitation.claimer.ts` | `PgInvitationClaimer` |
| `.rules.ts` | `role.rules.ts` | `RoleRules` |
| `.policy.ts` | `overdue-lock.policy.ts` | `OverdueLockPolicy` |
| `.strategy.ts` | `bearer-auth.strategy.ts` | `BearerAuthStrategy` |
| `.plugin.ts` | `organization.plugin.ts` | `OrganizationPlugin` |
| `.router.ts` | `task.router.ts` | `TaskRouter` |
| `.interceptor.ts` | `error.interceptor.ts` | `ErrorInterceptor` |
| `.consumer.ts` | `embedding.consumer.ts` | `EmbeddingConsumer` |
| `.schedule.ts` | `cleanup.schedule.ts` | `CleanupSchedule` |
| `.error.ts` | `forbidden.error.ts` | `ForbiddenError` |
| `.schema.ts` | `rbac.schema.ts` | Drizzle tables |
| `.config.ts` | `auth.config.ts` | `AuthConfig` |
| `.manifest.ts` | `image.manifest.ts` | `ImageManifest` |
| `.permissions.ts` | `task.permissions.ts` | a catalog fragment |
| `.errors.ts` | `core.errors.ts` | an error-catalog fragment |
| `.events.ts` | `core.events.ts` | an event-catalog fragment |
| `.actions.ts` | `member.actions.ts` | an activity-action fragment — the audit vocabulary |
| `.gate.ts` | `rbac.gate.ts` | a module-gate fragment |
| `.routes.ts` | `rbac.routes.ts` | a route fragment |
| `.flags.ts` | `widget.flags.ts` | a feature-flag fragment |
| `.widgets.ts` | `member.widgets.ts` | a widget-registry fragment |
| `.data.ts` | `nav.data.ts` | a content record |
| `.spec.ts` | `reactivate-task.use-case.spec.ts` | tests, in the package's `tests/` |

**Client packages add their own**, naming a kind of component or hook:

| Role suffix | Example file | Exports |
|---|---|---|
| `.form.tsx` | `sign-in.form.tsx` | `SignInForm` |
| `.list.tsx` | `member-list.tsx`, `active-session.list.tsx` | a list component |
| `.panel.tsx` | `two-factor.panel.tsx` | `TwoFactorPanel` |
| `.button.tsx` | `sign-out.button.tsx` | `SignOutButton` |
| `.notice.tsx` | `verify-email.notice.tsx` | `VerifyEmailNotice` |
| `.setup.tsx` | `two-factor.setup.tsx` | `TwoFactorSetup` |
| `.inspector.tsx` | `effective-permissions.inspector.tsx` | `EffectivePermissionsInspector` |
| `.guard.tsx` | `session.guard.tsx` | `SessionGuard` |
| `.context.tsx` | `session.context.tsx` | a provider plus its hooks |
| `.client.ts` | `account.client.ts` | `AccountClient` |
| `.queries.ts` | `member.queries.ts` | `MemberQueries` |
| `.mutations.ts` | `session.mutations.ts` | `SessionMutations` |
| `.fn.ts` | `session.fn.ts` | a TanStack server function |
| `.server.ts` | `container.server.ts` | anything the server-only ban exempts by name |

**The set is closed, and that is the point.** A role on neither table is a plain kebab-case file or
a decision made here first. A role invented per package means `grep -l '\.reader\.ts'` stops
answering "where are the read seams".

**Files with no layer role stay plain kebab-case** — `permission-registry.ts`, `capability-set.ts`,
`clock.ts`, `container.ts` — which is why `core` and `permissions` read differently from
`application`: they are the vocabulary the layers use, not in a layer.

## One class per file, and the filename derives from the class

Strip the role suffix, kebab-case the rest, append `.<role>.ts`: `ReactivateTaskUseCase` →
`reactivate-task.use-case.ts`.

## Two exemptions to the subject-first order

1. **Use-cases lead with the verb** — `reactivate-task.use-case.ts`, mirroring
   `ReactivateTaskUseCase`, which outranks folder-prefix symmetry.
2. **Implementations lead with the technology** — `pg-vector.store.ts`, `redis-cache.store.ts`,
   `s3-storage.gateway.ts`, `bearer-auth.strategy.ts` — so you can see what to delete when a vendor
   changes.

> [!IMPORTANT]
> **The technology joins with a hyphen; only the role takes the dot.** `redis-cache.store.ts`, never
> `redis.cache-store.ts` — the second spells the role `cache-store`, so `*.store.ts` misses it and the
> closed set grows an undecided synonym. Nineteen files (every vendor adapter outside `pg/` and `s3/`,
> plus their fakes) were once written the second way: an unenforced convention after a few months.

## Framework-dictated filenames win

`$goalId.tsx`, `-guard.ts`, `rpc.$.ts`, `vite.config.ts`, `drizzle.config.ts`, `tsup.config.ts`. In
`apps/web/src/route/`, TanStack's conventions are load-bearing — a `-` prefix marks a file as *not* a
route.

## Banned filenames

`utils.ts`, `helpers.ts`, `common.ts`, `misc.ts` — where unowned code accumulates. A barrel may
re-export, never contain logic. (`packages/content/src/message/en/common.ts` is not an exemption:
`common` is a namespace name in a closed union.)

## Tests mirror `src/`, and never live inside it

`src/error/app.error.ts` → `tests/error/app.error.spec.ts`. `src/` stays the shipped surface (`tsup`
builds from `src/index.ts`; the `development` condition resolves into `src/`), and the mirror keeps
what colocation was good at — knowing where a test is. `*.stories.tsx` is **not** a test and stays
in `src/`.

### `infrastructure` organises tests by subject

Every other `src/` is organised by subject, so the mirror is free. `infrastructure` is organised **by
vendor** (`pg/`, `redis/`, `s3/`, `smtp/`), and mirroring it piles about twenty-five specs into
`tests/pg/repository/`. So its `tests/` is by **subject** — `rbac/`, `member/`, `messaging/`,
`outbox/`, `platform/`, `cold/`, `maintenance/`, `vector/` — keeping vendor folders (`redis/`,
`smtp/`, `loki/`, `openai/`, `clickhouse/`) where the adapter is the subject.

**The deciding case is a spec with no one file to mirror:** `tests/rbac/tenant-cascade.spec.ts`
(deleting a tenant reaches every referencing table) and `tests/maintenance/tenant-partition.spec.ts`
(a seed, a gateway and the allowlist together). A rule with no answer gets one invented per author.
This is the only exemption; the test is whether `src/` is organised by something other than subject.
