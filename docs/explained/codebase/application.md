---
title: Application (the business logic)
description: The business logic: one use-case per action, talking to the outside world only through ports.
---

# Application (the business logic)

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The heart of the system. Every action a person or the worker can take is a use-case class here: invite a member, publish a doc page, suspend an account, send the daily digest. Each one checks permission first (`Authorizer.assert`), then does the work through ports.

A port is an abstract class saying what the logic needs ("store this", "send that email", "cache this") without saying how. The real implementations live in `infrastructure`. This package names no framework, no database library and no logger, and the build fails if it ever does. That is what makes every vendor choice reversible.

Folders by subject: `ai`, `apikey`, `doc`, `flag`, `mail`, `member`, `notification`, `platform`, `rbac`, `subscriber`, plus `port` (the interfaces) and `primitive` (shared building blocks such as `Principal` and `Authorizer`).

| | |
|---|---|
| Folder | `packages/application/` |
| Files | 248 |
| Uses | [Content](content.md), [Contracts](contracts.md), [Core](core.md), [Errors](errors.md), [Permissions](permissions.md) |
| Used by | [Infrastructure (the real adapters)](infrastructure.md), [Auth](auth.md), [Composition (the wiring)](composition.md), [API server](api-server.md), [The web app](app-web.md), [The worker](app-worker.md), [The realtime app](app-realtime.md) |

## Every file

### `packages/application/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/application/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/application/src/ai/`

| File | What it does |
|---|---|
| `ai-search-mode.ts` | `SearchMode`: how documents are searched, chosen once at start-up from `EMBEDDING_PROVIDER`. `lexical` (plain full-text search, no AI provider, no outside calls) or a vector mode. |
| `index-document.use-case.ts` | Indexes one document for AI search: splits the text into chunks, asks the embedding provider for vectors in batches, and replaces the document's old chunks in one transaction. Run by the worker. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `queue-document-index.use-case.ts` | The request-side half of indexing: checks the permission, then puts an "index this document" job on the queue and returns at once, because embedding takes a network round trip. |
| `reembed-chunks.use-case.ts` | After the AI provider or model changes, re-embeds every chunk the current model did not write, a batch at a time. The text and chunk boundaries stay as they are. Run by `pnpm ai:reindex`. |
| `search-documents.use-case.ts` | Searches indexed documents. Turns the question into a vector (or uses full-text search when no provider is set) and only searches documents the person may read, before ranking anything. |

### `packages/application/src/apikey/`

| File | What it does |
|---|---|
| `api-key.repository.ts` | `ApiKeyRepository`: the interface for storing API keys. Separate shapes for authentication (carries the digest) and for the settings list (never does). |
| `api-key.rules.ts` | `ApiKeyRules`: mints a new key (a recognisable prefix plus a random secret) and its digest. The format lives here because both this package and `auth` depend on it. |
| `create-api-key.use-case.ts` | Creates an API key. The person must be signed in (a key cannot mint a key), may only give the key permissions they hold, and sees the secret exactly once. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `list-api-keys.use-case.ts` | Lists the organization's API keys. The organization always comes from the signed-in person, never from the input. |
| `revoke-api-key.use-case.ts` | Revokes an API key by stamping a time on it. The row stays for the audit trail, and revoking twice keeps the first time. |

### `packages/application/src/doc/`

| File | What it does |
|---|---|
| `create-doc-page.use-case.ts` | Creates a page, section heading or outside link in a doc space. A page starts as an empty draft and reaches readers only when published. |
| `create-doc-space.use-case.ts` | Creates a doc space (a docs section with its own sidebar, audience, theme and slug). |
| `delete-doc-page.use-case.ts` | Deletes a page and everything under it, rebuilds the space's sidebar, then queues a sweep of the space's unlinked images. |
| `delete-doc-space.use-case.ts` | Deletes a space with every page and revision in one transaction, then its grants and finally its stored images. |
| `doc-access.ts` | `DocAccess`: who may read one of the platform organization's spaces from outside it, based on its audience (public, granted, members, owner) and its grants. A space you may not read answers "not found", so private names cannot be discovered. |
| `doc-feature.policy.ts` | `DocFeaturePolicy`: checks a doc's access links. A space or page tied to a module, permission, flag or plan is shown only to readers who pass every link. Remembers what it has read within one request, so a big tree costs at most one flag read and one plan read. |
| `doc-grant.repository.ts` | `DocGrantRepository`: the interface for storing doc grants (who outside the platform may read a granted space), and for turning a typed name, slug or email into the organization, person or plan it names. |
| `doc-image-key.ts` | `DocImageKey`: builds a doc image's storage key (`doc/<organization>/<space>/<id>.<type>`) and the app URL that serves it. Because the key holds the organization and space, deleting either is one folder delete. |
| `doc-image-orphans.ts` | `DocImageOrphans`: deletes the images of one space that no draft, published page or revision links any more, skipping anything uploaded in the last hour. Queued by a page delete. |
| `doc-image-sweep.ts` | `DocImageSweep`: deletes every stored image under one folder (a space's or an organization's), in bounded batches. |
| `doc-page.repository.ts` | `DocPageRepository`: the interface for storing pages: the tree, drafts, the published copy, publishing, revisions, search sections and the list of pages an older renderer wrote. |
| `doc-rerender.ts` | `DocRerender`: re-renders every published page that an older version of the Markdown renderer produced, for one organization. Run by the worker after the renderer changes (`pnpm doc:rerender`). |
| `doc-search.ts` | `DocSearch`: runs a full-text search across the doc spaces a reader may see and turns each match into the page path to open, dropping anything the reader's access links hide. |
| `doc-shape.ts` | `DocShape`: turns stored rows into the shapes sent to the browser, including the page status (draft, published, changed since publishing). |
| `doc-space.repository.ts` | `DocSpaceRepository`: the interface for storing spaces, including each space's ready-made published sidebar. |
| `doc-tree.ts` | `DocTree`: rebuilds a space's published sidebar from its rows, inside the same transaction as the change that caused it. |
| `doc.cache.ts` | `DocCache`: caches what readers fetch (a space's sidebar and each published page) in Redis, so a warm page read costs no database query. A page's cache key includes its revision, so publishing makes a new key instead of going stale. |
| `doc.rules.ts` | `DocRules`: the rules every docs use-case shares: allowed slugs, reserved names, how deep pages may nest, the page path, who may read each audience, and which spaces only the platform organization may create. |
| `get-doc-page.use-case.ts` | Gets a page's draft for the editor. |
| `get-doc-revision.use-case.ts` | Gets one old published version of a page, for the history view. |
| `get-doc-space.use-case.ts` | Gets one space's settings for the editor. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `list-doc-access-options.use-case.ts` | Lists the modules, permissions, flags and plans a writer may tie a doc to, for the pickers. |
| `list-doc-grants.use-case.ts` | Lists who a granted space is open to, expired grants included. |
| `list-doc-pages.use-case.ts` | Lists every page in a space for the editor's tree, drafts included, without page bodies. |
| `list-doc-revisions.use-case.ts` | Lists a page's published versions, newest first, as summaries. |
| `list-doc-spaces.use-case.ts` | Lists the person's own organization's spaces, except other authors' private (`owner`) spaces. |
| `list-platform-doc-spaces.use-case.ts` | Lists the platform's spaces a viewer may open on `/docs`: public ones for anyone, granted ones for those with a grant. |
| `move-doc-page.use-case.ts` | Moves a page to a new parent or position, checking that every path under it is still valid afterwards. |
| `open-doc-image.use-case.ts` | Serves a doc image: checks the reader may read that page, then hands back a short-lived signed URL to the file in storage. |
| `preview-doc-page.use-case.ts` | Renders unsaved Markdown with the same renderer publishing uses, so the preview always matches the published page. |
| `publish-doc-page.use-case.ts` | Publishes a page. Renders the Markdown to HTML once, then in one transaction saves the published copy, adds a revision, replaces the page's search sections and rebuilds the sidebar. Refuses if the editor's copy is out of date. |
| `read-doc-nav.use-case.ts` | Reads a space's full published sidebar, for the reader to swap in after the first paint. |
| `read-doc-page.use-case.ts` | Reads a published page for a member of the organization, with its space and a trimmed sidebar. Hidden spaces and pages answer "not found". |
| `read-platform-doc-nav.use-case.ts` | The platform version of reading a full sidebar, for public and granted spaces. Works signed out. |
| `read-platform-doc.use-case.ts` | Reads a page from the platform's public or granted spaces. Works for anyone, signed in or not; a space you may not read answers "not found". |
| `restore-doc-revision.use-case.ts` | Copies an old published version back into the draft. Publishing it is a separate step. |
| `revoke-doc-grant.use-case.ts` | Removes one doc grant and clears the cached answers, so the reader loses access straight away. |
| `save-doc-grant.use-case.ts` | Opens a granted platform space to an organization, a person or a plan. Audited in the platform's own trail. |
| `save-doc-page.use-case.ts` | Saves the editor's draft (title, Markdown, slug, icon, access link). Not audited, because readers see nothing until it is published. |
| `search-docs.use-case.ts` | The search palette (Ctrl+K) over the person's own organization's docs, filtered before ranking so hidden spaces never show. |
| `search-platform-docs.use-case.ts` | The same search over the platform's docs, limited to the spaces the viewer may read. |
| `update-doc-space.use-case.ts` | Changes a space's settings (title, audience, theme, GitHub link, access link). A field left out keeps its stored value. |
| `upload-doc-image.use-case.ts` | Prepares an image upload: checks permission, then signs a short-lived form that makes storage enforce the type and the length when the browser uploads the file to directly. |

### `packages/application/src/flag/`

| File | What it does |
|---|---|
| `flag.cache.ts` | `FlagCache`: answers "is this flag on for this organization?" from one cached copy of every flag, refreshed at least every minute. |
| `flag.repository.ts` | `FlagRepository`: the interface for storing flag switches and which organizations each flag is turned on for. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/application/src/mail/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `send-mail.use-case.ts` | Sends one email from a queued job: checks the template and its parameters, renders it, and hands it to the email sender. A failure is thrown so the queue retries. |

### `packages/application/src/member/`

| File | What it does |
|---|---|
| `change-member-role.use-case.ts` | Moves a member to another role. Refuses to leave the organization without an active owner, and refuses to give out a role that outranks the person doing it. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `invitation.mailer.ts` | `InvitationMailer`: the interface for sending an invitation email. The wording and links belong to the implementation. |
| `invitation.repository.ts` | `InvitationRepository`: the interface for storing invitations. Only the token's digest is stored. |
| `invite-member.use-case.ts` | Invites someone by email into a role. Checks permissions and rank, saves the invitation with the audit row and event in one transaction, then sends the mail after the commit. |
| `list-invitations.use-case.ts` | Lists pending invitations. |
| `list-members.use-case.ts` | Lists members of the organization with their roles and status. |
| `member-realtime.subscriber.ts` | Reacts to member events by pushing a "members changed" message on the live stream, so open screens refresh. |
| `member.repository.ts` | `MemberRepository`: the interface for reading and changing memberships. |
| `member.rules.ts` | `MemberRules`: shared answers about members: which role is the owner role, which is the platform admin role, and whether a change would leave no active owner. |
| `resend-invitation.use-case.ts` | Resends an invitation with a new token. The old link stops working. |
| `revoke-invitation.use-case.ts` | Cancels an invitation by deleting it. The audit row remembers it happened. |
| `set-member-active.use-case.ts` | Deactivates or reactivates a member. Refuses to lock out the last owner. |

### `packages/application/src/notification/`

| File | What it does |
|---|---|
| `count-unread-notifications.use-case.ts` | Counts unread notifications for the bell, capped at 99 and cached for a minute. |
| `deliver-notification.use-case.ts` | Turns one domain event into notifications: works out who should hear about it, respects each person's preferences, writes the in-app rows, queues emails and pushes live updates. A replayed event writes nothing twice. |
| `get-notification-preferences.use-case.ts` | Returns a person's complete preferences grid (every category and channel), filling in defaults for rows never saved. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `list-notifications.use-case.ts` | Lists the person's own notification inbox. |
| `mark-all-notifications-read.use-case.ts` | Marks every notification read. |
| `mark-notification-read.use-case.ts` | Marks one of the person's own notifications read. |
| `notification-preference.repository.ts` | `NotificationPreferenceRepository`: the interface for storing preferences, read for many people in one query. |
| `notification-recipient.reader.ts` | `NotificationRecipientReader`: the interface for finding who should receive a notification (organization members with a permission, or conversation members). |
| `notification.policy.ts` | `NotificationPolicy`: the table of which events notify whom, in which category, and by default through which channel (instant, daily digest or off). |
| `notification.repository.ts` | `NotificationRepository`: the interface for storing notifications. The event ID is the duplicate guard. |
| `notification.subscriber.ts` | Listens for every event in the notification policy and hands it to delivery. |
| `send-notification-digest.use-case.ts` | Sends the daily digest email: for each person who chose "digest", a summary of the day's unread notifications. |
| `update-notification-preference.use-case.ts` | Saves one of the person's own notification preferences. |

### `packages/application/src/platform/`

| File | What it does |
|---|---|
| `account.repository.ts` | `AccountRepository`: the interface for the super admin's account screen: a person's memberships, suspension and platform denies across every organization. |
| `account.rules.ts` | `AccountRules`: shared rules for account actions, including never removing the last person who can undo a suspension. |
| `adjust-entitlement.use-case.ts` | Adds or removes one permission for one organization on top of its plan, optionally until a date (a trial). Dependent permissions come along. |
| `assign-plan.use-case.ts` | Moves an organization to a plan. Roles are untouched; a downgrade only hides extra permissions, so moving back restores them. |
| `clear-account-deny.use-case.ts` | Clears a permission the platform denied to one person. |
| `clear-entitlement-adjustment.use-case.ts` | Removes one entitlement adjustment, returning that permission to what the plan says. |
| `delete-organization.use-case.ts` | The request half of deleting an organization: checks the typed confirmation and every guard, then queues the delete job. |
| `delete-plan.use-case.ts` | Deletes a plan, only if no organization uses it and it is not the default. |
| `deny-account-permission.use-case.ts` | Takes one permission away from one person in one organization, as the platform. That organization's admin sees it and cannot clear it. |
| `entitlement.repository.ts` | `EntitlementRepository`: the interface for plans, per-organization adjustments and module switches. |
| `entitlement.rules.ts` | `EntitlementRules`: which permissions may go into a plan or adjustment (never `core` or `platform` ones), plan key format, and closing over dependencies. |
| `expire-entitlement-adjustments.use-case.ts` | Nightly worker job: removes expired entitlement adjustments and audits each. |
| `export-organization.use-case.ts` | Queues an export of all of one organization's data to storage. At most one per organization per day. |
| `find-account.use-case.ts` | Looks a person up by email: their memberships, suspension and platform denies in every organization. |
| `get-organization-entitlement.use-case.ts` | Shows one organization's plan, its adjustments, and how much of each role the plan lets through. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `inspect-platform-status.use-case.ts` | The platform status page: database, caches, queues and (if present) analytics store and replica health. |
| `list-flags.use-case.ts` | Lists every feature flag with its owner, expiry, switch and targets, plus rows for flags the code no longer declares. |
| `list-module-switches.use-case.ts` | Lists every module the emergency kill switch can turn off, and whether it is on. |
| `list-plans.use-case.ts` | Lists the plans and marks the default one new signups get. |
| `list-tenant-exports.use-case.ts` | Lists one organization's finished exports with short-lived download links. |
| `list-tenant-export-images.use-case.ts` | Lists one export's copied doc images, each with an hour-long download link, for the exports screen to save as a file. |
| `platform-health.reader.ts` | `PlatformHealthReader`: the interface for the health readings the status page shows. |
| `platform-policy.repository.ts` | `PlatformPolicyRepository`: the interface for the one row of deployment-wide switches. |
| `platform.reader.ts` | `PlatformReader`: answers "which organization is the platform (super admin) organization?". There is exactly one, marked by the seed. |
| `purge-organization.use-case.ts` | The job half of deleting an organization, run on its database node: drops its partitions and rows, sweeps its stored files, keeps a 30-day archive, clears caches and audits the cost. |
| `reinstate-account.use-case.ts` | Lifts the platform's suspension of an account. Nothing else changes. |
| `retention.rules.ts` | `RetentionRules`: turns retention settings into the storage bucket's lifecycle rules, including the fixed seven-day rule that removes tenant exports. |
| `save-plan.use-case.ts` | Creates or replaces a plan and its permissions, with dependencies included. |
| `shard-map.reader.ts` | `ShardMapReader`: the interface for reading database nodes and the organizations on each. |
| `suspend-account.use-case.ts` | Suspends an account in every organization at once, signs it out everywhere, and audits it in each organization it belongs to. |
| `switch-module.use-case.ts` | The emergency kill switch: turns a whole module off (or back on) for every organization. A reason is required to turn one off. |
| `tenant.repository.ts` | `TenantRepository`: the interface for finding and removing an organization row. |
| `toggle-replica-reads.use-case.ts` | Turns on or off sending the worker's heavy reads to a read-only database copy. |
| `update-default-plan.use-case.ts` | Changes which plan new signups get. |
| `update-flag-target.use-case.ts` | Turns a feature flag on or off for one organization. |
| `update-flag.use-case.ts` | Turns a feature flag on or off for the whole deployment. |

### `packages/application/src/port/`

| File | What it does |
|---|---|
| `activity.logger.ts` | `ActivityLogger`: the interface for writing an audit row (who did what, when). Written inside the same transaction as the change. |
| `cache.store.ts` | `CacheStore`: the interface for the cache (get, set with expiry, delete, delete by prefix, set only if absent). |
| `capability.invalidator.ts` | `CapabilityInvalidator`: the interface for clearing cached permissions after a role, membership or plan changes. |
| `domain-event.publisher.ts` | `DomainEventPublisher`: the interface for announcing a domain event. Called inside the transaction, so the event is only sent if the change commits. |
| `email.sender.ts` | `EmailSender`: the interface for actually sending one email (text and HTML parts). |
| `embedding.provider.ts` | `EmbeddingProvider`: the interface for turning text into vectors, always in batches. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `mail.publisher.ts` | `MailPublisher`: the interface for asking for an email to be sent. It puts a job on the mail queue; the worker sends it. |
| `mail.renderer.ts` | `MailRenderer`: the interface for turning a template and its parameters into a subject, text and HTML in the recipient's language. |
| `maintenance.gateway.ts` | `MaintenanceGateway`: the interface for housekeeping: sweeping expired sessions, tokens and invitations, creating future partitions, and counting leftovers. |
| `markdown.renderer.ts` | `MarkdownRenderer`: the interface for turning Markdown into safe HTML, a table of contents and search sections. Run once when a page is published. |
| `organization.reader.ts` | `OrganizationReader`: the interface for walking every organization a page at a time, for per-tenant jobs. |
| `outbox.gateway.ts` | `OutboxGateway`: the interface for draining the outbox: claim a batch of unsent events, hand them on, mark them sent. Delivers at least once. |
| `partition-archive.gateway.ts` | `PartitionArchiveGateway`: the interface for moving data in and out of file storage: archiving an organization's tables when it is deleted, exporting a whole organization, and sweeping a deleted organization's files after 30 days. |
| `queue.publisher.ts` | `QueuePublisher`: the interface for putting a job on a queue, with options for duplicate protection, delay and priority. |
| `rate-limit.store.ts` | `RateLimitStore`: the interface for a counter that resets after a time window, used for rate limiting. |
| `realtime.publisher.ts` | `RealtimePublisher`: the interface for pushing a message to a live stream channel. Fire and forget. |
| `realtime.subscriber.ts` | `RealtimeSubscriber`: the interface for listening to a live stream channel, with resume from the last message seen. |
| `relayed-activity.store.ts` | `RelayedActivityStore`: the interface for writing an audit row that arrived through the outbox onto the organization's own database node. |
| `session.gateway.ts` | `SessionGateway`: the interface for ending every session a user has, used when an account is suspended. |
| `session.resolver.ts` | `SessionResolver`: the interface for turning request headers into a signed-in session (user and active organization). |
| `shard.resolver.ts` | `ShardResolver`: the interface for answering "which database node holds this organization, and is it mid-move?", cached. |
| `sharding.strategy.ts` | `ShardingStrategy`: the interface for deciding which database node a request runs against. The shipped strategy uses the organization. |
| `storage-policy.gateway.ts` | `StoragePolicyGateway`: the interface for setting the storage bucket's lifecycle rules (delete after N days). |
| `storage.gateway.ts` | `StorageGateway`: the interface for file storage (S3): put, get, delete, list, signed URLs, and streamed reads and writes. |
| `tenant-membership.reader.ts` | `TenantMembershipReader`: the interface for "is this person an active member of this organization?", one or many at a time. |
| `unit-of-work.ts` | `UnitOfWork`: the interface for "run this work in one database transaction". |
| `user.reader.ts` | `UserReader`: the interface for looking up display names by user ID. |
| `vector.store.ts` | `VectorStore`: the interface for storing document chunks with their vectors and searching them by similarity or by full text. |

### `packages/application/src/primitive/`

| File | What it does |
|---|---|
| `authorizer.ts` | `Authorizer`: the real permission gate. Every use-case calls `assert()` first, so the check runs no matter how the call arrived (web request, server render or worker). |
| `cancellation.ts` | `CancellationSignal`: a minimal "stop now" signal the domain can accept without depending on browser or Node types. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `job-key.ts` | `JobKey`: builds safe job IDs for the queue (no `:`), hashing long or untrusted parts. |
| `partitioned-table.ts` | `PartitionedTable`: the list of tables split by organization and, for those that grow with activity, by month, with how many months each is kept. The worker and the migrations both read it. |
| `principal.ts` | `Principal`: who is acting, in one shape, however they arrived: a browser session, a desktop token, an API key or the worker. It holds the user, the organization and the resolved permissions. |
| `queue-name.ts` | `QueueName`: the queues, one per kind of work (mail, notifications, embedding, maintenance, outbox and so on), each with its own speed and priority. |
| `realtime-channel.ts` | `RealtimeChannels`: builds live stream channel names, always starting with the organization so they can never be mixed up across tenants. |
| `shard.ts` | `Shard` and `TablePlacement`: which tables live on the shared catalog database, which are local, and which are routed to the organization's own node. |

### `packages/application/src/rbac/`

| File | What it does |
|---|---|
| `capability-resolution.ts` | `CapabilityResolution`: turns a person's roles, overrides and plan into their final permission set. Denies beat grants, unknown keys are ignored, and the plan filters last. The same code explains "why" on the inspector screen. |
| `capability.repository.ts` | `CapabilityRepository`: the interface for reading everything a person's permissions are built from. |
| `clear-permission-override.use-case.ts` | Removes one per-person exception, returning that permission to what the role says. |
| `create-role.use-case.ts` | Creates a role with no permissions. Reserved names such as `owner` are refused. |
| `delete-role.use-case.ts` | Deletes a role, only if nobody holds it. |
| `deny-permission-override.use-case.ts` | Takes one permission away from one person, permanently, on top of their role. |
| `expire-permission-overrides.use-case.ts` | Nightly worker job: removes expired per-person grants and audits each. |
| `get-entitlement.use-case.ts` | Reads the organization's plan ceiling for the role editor, which greys out permissions the plan does not include. |
| `grant-permission-override.use-case.ts` | Gives one person one extra permission for a stated reason until a date (30 days by default, 90 at most). |
| `grant-permission.use-case.ts` | Adds a permission to a role. Nobody can hand out a permission they do not hold themselves. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `inspect-effective-permissions.use-case.ts` | Shows what one member can actually do and where each permission came from (role, override, plan). |
| `list-permission-overrides.use-case.ts` | Lists one member's live exceptions, including platform denies. |
| `list-roles.use-case.ts` | Lists the organization's roles with their permissions. |
| `permission-override.repository.ts` | `PermissionOverrideRepository`: the interface for storing per-person exceptions. |
| `permission-override.rules.ts` | `PermissionOverrideRules`: which permissions may be overridden and the expiry rules (grants lapse, denies do not). |
| `revoke-permission.use-case.ts` | Removes a permission from a role. Nobody can strip a permission they could not grant. |
| `role.repository.ts` | `RoleRepository`: the interface for storing roles and their permissions. |
| `role.rules.ts` | `RoleRules`: shared rules for role writes: reserved keys, name format and the no-escalation check. |
| `update-role.use-case.ts` | Renames a role. |

### `packages/application/src/subscriber/`

| File | What it does |
|---|---|
| `activity-relay.subscriber.ts` | Writes an audit row that a catalog transaction could not write on the organization's own node, after it arrives through the outbox. |
| `event.subscriber.ts` | `EventSubscriber`: the base for anything that reacts to domain events. Each must be safe to run twice on the same event. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `subscriber-registry.ts` | `SubscriberRegistry`: the list of every event subscriber, checked at start-up (unique names, known events) so a wiring mistake crashes on boot instead of losing events. |

### `packages/application/tests/ai/`

| File | What it does |
|---|---|
| `document.use-case.spec.ts` | Tests queueing, indexing and searching documents, including permission checks and duplicate job protection across organizations. |
| `index-document.use-case.spec.ts` | Tests document indexing: chunking, batching and replacing old chunks. |
| `search-documents.spec.ts` | Tests search in each mode, including that the no-provider mode makes no outside calls, and re-embedding after a model change. |

### `packages/application/tests/apikey/`

| File | What it does |
|---|---|
| `api-key.rules.spec.ts` | Tests `api-key.rules.ts`. |
| `api-key.use-case.spec.ts` | Tests creating, listing and revoking API keys, including that a key cannot mint a key and nobody can give a key more than they hold. |

### `packages/application/tests/doc/`

| File | What it does |
|---|---|
| `doc-access.spec.ts` | Tests `doc-access.ts`. |
| `doc-feature.policy.spec.ts` | Tests `doc-feature.policy.ts`. |
| `delete-doc-page.use-case.spec.ts` | Tests that deleting a page queues one image sweep for its space. |
| `doc-image-orphans.spec.ts` | Tests which images the sweep deletes and which it keeps. |
| `doc-image.use-case.spec.ts` | Tests uploading and serving doc images. |
| `doc-rerender.spec.ts` | Tests `doc-rerender.ts`. |
| `doc-search.spec.ts` | Tests `doc-search.ts`. |
| `doc-write-authorization.spec.ts` | Tests that every docs write checks the person's own organization and can never touch another organization's docs. |
| `doc.cache.spec.ts` | Tests `doc.cache.ts`. |
| `doc.rules.spec.ts` | Tests `doc.rules.ts`. |
| `read-doc-page.use-case.spec.ts` | Tests `read-doc-page.use-case.ts`. |

### `packages/application/tests/flag/`

| File | What it does |
|---|---|
| `flag.cache.spec.ts` | Tests `flag.cache.ts`. |

### `packages/application/tests/mail/`

| File | What it does |
|---|---|
| `send-mail.use-case.spec.ts` | Tests `send-mail.use-case.ts`. |

### `packages/application/tests/member/`

| File | What it does |
|---|---|
| `invite-member.use-case.spec.ts` | Tests `invite-member.use-case.ts`. |
| `list-members.use-case.spec.ts` | Tests `list-members.use-case.ts`. |
| `member-lifecycle.use-case.spec.ts` | Tests changing roles and deactivating members, including the last-owner and outrank guards and the platform organization's admins. |
| `member-realtime.subscriber.spec.ts` | Tests `member-realtime.subscriber.ts`. |
| `resend-invitation.use-case.spec.ts` | Tests `resend-invitation.use-case.ts`. |
| `revoke-invitation.use-case.spec.ts` | Tests `revoke-invitation.use-case.ts`. |

### `packages/application/tests/notification/`

| File | What it does |
|---|---|
| `count-unread-notifications.use-case.spec.ts` | Tests `count-unread-notifications.use-case.ts`. |
| `deliver-notification.use-case.spec.ts` | Tests `deliver-notification.use-case.ts`. |
| `notification-preferences.use-case.spec.ts` | Tests reading and saving notification preferences, including the full default grid. |
| `notification.policy.spec.ts` | Tests `notification.policy.ts`. |
| `send-notification-digest.use-case.spec.ts` | Tests `send-notification-digest.use-case.ts`. |

### `packages/application/tests/platform/`

| File | What it does |
|---|---|
| `account.use-case.spec.ts` | Tests finding, suspending and reinstating accounts and platform denies, including never removing the last person who can undo them. |
| `delete-organization.use-case.spec.ts` | Tests `delete-organization.use-case.ts`. |
| `entitlement.rules.spec.ts` | Tests `entitlement.rules.ts`. |
| `entitlement.use-case.spec.ts` | Tests plans and entitlement adjustments, including that the platform organization can never be put on a plan. |
| `export-organization.use-case.spec.ts` | Tests `export-organization.use-case.ts`. |
| `flag.use-case.spec.ts` | Tests listing and switching feature flags and their per-organization targets. |
| `inspect-platform-status.use-case.spec.ts` | Tests `inspect-platform-status.use-case.ts`. |
| `purge-organization.use-case.spec.ts` | Tests `purge-organization.use-case.ts`. |
| `retention.rules.spec.ts` | Tests `retention.rules.ts`. |
| `toggle-replica-reads.use-case.spec.ts` | Tests `toggle-replica-reads.use-case.ts`. |

### `packages/application/tests/primitive/`

| File | What it does |
|---|---|
| `authorizer.spec.ts` | Tests `authorizer.ts`. |
| `principal.spec.ts` | Tests `principal.ts`. |
| `realtime-channel.spec.ts` | Tests `realtime-channel.ts`. |
| `shard.spec.ts` | Tests `shard.ts`. |

### `packages/application/tests/rbac/`

| File | What it does |
|---|---|
| `capability-resolution.spec.ts` | Tests `capability-resolution.ts`. |
| `inspect-effective-permissions.use-case.spec.ts` | Tests `inspect-effective-permissions.use-case.ts`. |
| `list-roles.use-case.spec.ts` | Tests `list-roles.use-case.ts`. |
| `permission-override.use-case.spec.ts` | Tests per-person grants and denies, including expiry limits and the no-escalation rule. |
| `role-management.use-case.spec.ts` | Tests creating, renaming, deleting roles and granting or revoking permissions, including reserved names and no escalation. |

### `packages/application/tests/subscriber/`

| File | What it does |
|---|---|
| `activity-relay.subscriber.spec.ts` | Tests `activity-relay.subscriber.ts`. |
| `subscriber-registry.spec.ts` | Tests `subscriber-registry.ts`. |

### `packages/application/tests/support/`

| File | What it does |
|---|---|
| `example-flag.ts` | Declares a pretend flag for tests, because the small kit ships with no flags. |

### `packages/application/docs/`

| File | What it does |
|---|---|
| `index.md` | Principal, Authorizer, and the abstract ports. Zero framework imports and no third-party runtime dependency — the package that makes every infrastructure decision reversible. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/application/docs/reference/`

| File | What it does |
|---|---|
| `authorizer.md` | Three lines that are the system's only real permission gate — why they live in the use-case, the position they occupy, and the timing leak that position accepts. |
| `doc.md` | One slice for public, private and organization docs — why platform docs are the platform organization's rows, how a page is rendered once and read from one row, and who may read what. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `notification-policy.md` | What an event means to a person — who hears about it, in which channel, and why the unread count is cached while the rows never are. |
| `platform.md` | What a use-case above the tenant may assume, why its health seam is a slice port rather than a cross-cutting one, and the audit rebase that keeps a global change out of a customer's trail. |
| `ports.md` | One section per port whose reasoning outgrew a two-line comment — why three of them carry no Principal, and what each abstract method is refusing to offer. |
