---
title: Contracts
description: Every API endpoint's shape, the ID types, event and audit names, and the endpoint-to-permission map.
---

# Contracts

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The shapes that cross a boundary, declared once: every API endpoint's path, input and output (with Zod schemas), the branded ID types, the list and paging shapes, the live-stream messages, the email templates, the audit action names, the domain event names, and the map from every endpoint to the permission it requires.

The server implements these contracts and the browser client is generated from them, so a mismatch is a compile error, not a runtime surprise. An endpoint with no permission entry is refused.

| | |
|---|---|
| Folder | `packages/contracts/` |
| Files | 95 |
| Uses | [Core](core.md), [Errors](errors.md), [Permissions](permissions.md) |
| Used by | [Application (the business logic)](application.md), [Infrastructure (the real adapters)](infrastructure.md), [Auth](auth.md), [Composition (the wiring)](composition.md), [API server](api-server.md), [API client](api-client.md), [Query (data fetching and caching)](query.md), [Feature (the screens' building blocks)](feature.md), [The web app](app-web.md), [The worker](app-worker.md), [The realtime app](app-realtime.md) |

## Every file

### `packages/contracts/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |

### `packages/contracts/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/contracts/src/apikey/`

| File | What it does |
|---|---|
| `api-key.contract.ts` | The shapes for API keys: a key as listed (name, prefix, permissions, expiry; never the secret), the create input, and the one response that carries the secret once. |
| `api-key.entity.ts` | `ApiKeyEntity`: small pure answers about one key row, such as "is it expired" and "is it still usable", so every list shows them the same way. |
| `api-key.procedures.ts` | The API key endpoints: list, create, revoke. Revoking keeps the row for the audit trail. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/contracts/src/catalog/`

| File | What it does |
|---|---|
| `activity-actions.ts` | `ACTIVITY_ACTIONS`: every audit action name (for example `member.invited`), merged from the per-area files. |
| `activity.events.ts` | The domain event that carries an audit row to another database node when the action was written on the catalog database. |
| `ai.actions.ts` | Audit action names for document indexing. |
| `apikey.actions.ts` | Audit action names for API keys (created, revoked). |
| `apikey.permissions.ts` | The permission each API key endpoint requires. |
| `doc.actions.ts` | Audit action names for docs: spaces created and changed, pages published, moved, deleted, revisions restored. Draft saves are deliberately not audited. |
| `doc.permissions.ts` | The permission each docs endpoint requires. |
| `document.permissions.ts` | The permission each document (AI search) endpoint requires. |
| `domain-events.ts` | `DOMAIN_EVENTS`: every domain event (a fact other parts of the system react to, such as `member.invited`), merged from the per-area files. |
| `index.ts` | `PROCEDURE_PERMISSIONS`: the merged map from every API endpoint to the permission it requires. An endpoint missing from this map is refused. |
| `member.actions.ts` | Audit action names for members and invitations. |
| `member.events.ts` | Domain events for members (for example an invitation was created), with exactly the data a subscriber needs. The invitation token is never included. |
| `member.permissions.ts` | The permission each member endpoint requires. |
| `notification.permissions.ts` | The permission each notification endpoint requires. |
| `override.actions.ts` | Audit action names for per-person permission overrides (granted, denied, cleared, expired). |
| `override.permissions.ts` | The permission each override endpoint requires. |
| `platform.actions.ts` | Audit action names for super admin actions: plan and entitlement changes, flags, account suspension, tenant export and delete, and the rest. |
| `platform.permissions.ts` | The permission each super admin endpoint requires. Every platform permission must be used by at least one endpoint here, or the architecture check fails. |
| `realtime.permissions.ts` | The permission each live-stream endpoint requires. |
| `role.actions.ts` | Audit action names for roles (created, renamed, deleted, permission granted or revoked). |
| `role.permissions.ts` | The permission each role endpoint requires. |

### `packages/contracts/src/doc/`

| File | What it does |
|---|---|
| `doc-access.contract.ts` | The shape of a doc's access link (a module, permission, flag or plan it is tied to), and the list of choices the editor offers. |
| `doc-grant.contract.ts` | The shapes for doc grants: opening a "granted" platform space to one organization, one person, or every organization on a plan, with a reason and an optional expiry. |
| `doc-grant.procedures.ts` | The doc grant endpoints: list, save, revoke. All need `platform.doc.grant`. |
| `doc-nav.ts` | `DocNavNodeDto` and `DocNav`: one node of a space's sidebar tree, which is a section heading, a page, or an outside link, with its children. |
| `doc-page.contract.ts` | Every shape for doc pages: the editor's tree and draft, the published page with its table of contents, the reader's response, create, save, publish, move and preview inputs, revision history, search hits and image uploads. Also the limits, such as the longest page allowed. |
| `doc-page.procedures.ts` | The doc page endpoints: read a page as a reader, the editor's tree, create, save a draft, publish, move, delete, preview, list and restore revisions, search, and get an image upload address. |
| `doc-space.contract.ts` | The shapes for doc spaces: the audience (members, public, granted, owner), slug, title, icon, theme, GitHub link, access link, the space as listed, and its sidebar. |
| `doc-space.procedures.ts` | The doc space endpoints: list, read, read the sidebar, create, update, delete. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/contracts/src/document/`

| File | What it does |
|---|---|
| `document.contract.ts` | The shapes for AI document search: a document to index, the "queued" answer, a search query, and one hit (a matching chunk with its similarity score). |
| `document.procedures.ts` | The document endpoints: index a document (the work is queued for the worker) and search. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/contracts/src/mail/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `mail-template.manifest.ts` | `MailTemplates`: every email the system can send (verify email, reset password, invitation, two-factor code, digest and more) and the exact parameters each needs. The worker checks a queued mail job against it before rendering. |

### `packages/contracts/src/member/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `member.contract.ts` | The shapes for members and invitations: a member as listed (name, email, role, active, suspended), an invitation, and the inputs to invite, resend, revoke, change role and deactivate. |
| `member.entity.ts` | `MemberEntity`: small pure answers about a member row, such as "is this the owner" and "is the account suspended by the platform". |
| `member.procedures.ts` | The member endpoints: list members and invitations, invite, resend, revoke, change role, deactivate and reactivate. |

### `packages/contracts/src/notification/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `notification.contract.ts` | The shapes for notifications: one notification, its kind and category, the archived-month query, and per-user preferences (per category and channel: instant, digest or off). |
| `notification.entity.ts` | `NotificationEntity`: which text to show for a notification and where clicking it should go. |
| `notification.procedures.ts` | The notification endpoints: list, unread count for the bell, mark one or all read, archived months, and preferences. |

### `packages/contracts/src/override/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `override.contract.ts` | The shapes for per-person overrides: one exception to a person's role (an extra permission or a removed one), with a reason and an expiry of at most 90 days. |
| `override.procedures.ts` | The override endpoints: list, grant, deny, clear. |

### `packages/contracts/src/platform/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `platform.contract.ts` | Every shape for the super admin screens: system health and status, plans and entitlements, accounts and suspension, module switches, feature flags and their targets, tenant export and delete, plus (in the big kit) retention, cold storage, the analytics projection, the read replica and the shard map. |
| `platform.procedures.ts` | Every super admin endpoint, each tied to its `platform.*` permission. |

### `packages/contracts/src/primitive/`

| File | What it does |
|---|---|
| `envelope.ts` | `Envelope`: the one list shape every list endpoint returns (items plus paging), so every screen handles empty lists the same way. |
| `identifiers.ts` | `Identifiers` and the branded ID types (`OrganizationId`, `UserId`, `DocPageId` and so on). Each ID has its own type, so passing a user ID where an organization ID belongs fails to compile. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `keyset.ts` | `Keyset`: cursor-based paging for big lists. The client sends back the opaque `nextCursor` it was given instead of a page number, which stays fast on huge tables. |
| `pagination.ts` | `Pagination`: page-number paging for small lists, capped at 100 per page. |
| `password.ts` | `Password`: the minimum and maximum password length, named once so every form agrees with the server. |

### `packages/contracts/src/procedure/`

| File | What it does |
|---|---|
| `index.ts` | `contract`: the whole API, merged from every area's procedures into one object. The web server implements it and the browser client calls it, so both sides share the same types. |

### `packages/contracts/src/realtime/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `realtime.contract.ts` | The live-stream message shapes: the closed list of event names the browser can receive and the small payload each carries (IDs to refresh, never data to show). |
| `realtime.procedures.ts` | The live-stream endpoint: one stream every signed-in tab opens. |

### `packages/contracts/src/registry/`

| File | What it does |
|---|---|
| `activity-actions.ts` | `ActivityActions`: looks up an audit action's details. The audit logger only accepts names from this list. |
| `domain-events.ts` | `DomainEvents`: looks up and validates domain events. Defines what a use-case hands the publisher and what a subscriber receives, typed so checking the event name also types its payload. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `procedure-permissions.ts` | `ProcedurePermissions`: looks up which permission an endpoint path requires, safely (unknown paths are refused). |

### `packages/contracts/src/role/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `role.contract.ts` | The shapes for roles: a role, its permissions, the effective-permission explanation for one person, and the inputs to create, rename, delete and grant or revoke a permission. |
| `role.entity.ts` | `RoleEntity`: small pure answers about a role, such as "is it a system role that is re-seeded on every deploy" and "is it the owner role". |
| `role.procedures.ts` | The role endpoints: list, create, update, delete, grant, revoke, inspect someone's effective permissions, and read the organization's plan ceiling. |

### `packages/contracts/tests/mail/`

| File | What it does |
|---|---|
| `mail-template.manifest.spec.ts` | Tests `mail-template.manifest.ts`. |

### `packages/contracts/tests/member/`

| File | What it does |
|---|---|
| `member.contract.spec.ts` | Tests `member.contract.ts`. |

### `packages/contracts/tests/primitive/`

| File | What it does |
|---|---|
| `envelope.spec.ts` | Tests `envelope.ts`. |
| `identifiers.spec.ts` | Tests `identifiers.ts`. |
| `keyset.spec.ts` | Tests `keyset.ts`. |
| `pagination.spec.ts` | Tests `pagination.ts`. |

### `packages/contracts/tests/realtime/`

| File | What it does |
|---|---|
| `realtime.contract.spec.ts` | Tests `realtime.contract.ts`. |

### `packages/contracts/tests/registry/`

| File | What it does |
|---|---|
| `activity-actions.spec.ts` | Tests `activity-actions.ts`. |
| `domain-events.spec.ts` | Tests `domain-events.ts`. |
| `procedure-permissions.spec.ts` | Tests `procedure-permissions.ts`. |

### `packages/contracts/tests/role/`

| File | What it does |
|---|---|
| `role.contract.spec.ts` | Tests `role.contract.ts`. |

### `packages/contracts/docs/`

| File | What it does |
|---|---|
| `index.md` | Branded identifiers, the one list envelope, the merged oRPC contract, and the procedure→permission map — the shapes every runtime agrees on. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/contracts/docs/reference/`

| File | What it does |
|---|---|
| `envelope.md` | One list shape for the whole product, and why the pagination cap lives in the schema. |
| `identifiers.md` | Why every UUID is branded, what branding costs, and where the parse boundary belongs. |
| `keyset.md` | Why the newer lists page by cursor rather than offset, why the page carries no total, and what the cursor actually encodes. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
| `procedure-permissions.md` | The map that guarantees no procedure ships ungated, the test that enforces it, and why the walker uses oRPC's own predicate. |
