---
title: Feature (the screens' building blocks)
description: The screens' building blocks: forms, lists and panels for every feature.
---

# Feature (the screens' building blocks)

> Part of the [codebase guide](index.md). Every file below is described in plain words; the [architecture page](../architecture.md) explains how the parts work together.

The real UI of each feature: forms, lists and panels that read through `query`, take their words from `content`, and draw with `ui`. Sign-in and account screens, members, roles, API keys, notifications, the docs reader and editor, the super admin panels, and so on.

It knows nothing about routing: the app passes in links and callbacks, so the same components could serve another shell.

| | |
|---|---|
| Folder | `packages/feature/` |
| Files | 131 |
| Uses | [Content](content.md), [Contracts](contracts.md), [Errors](errors.md), [Permissions](permissions.md), [Query (data fetching and caching)](query.md), [UI (the design system)](ui.md), [API client](api-client.md) |
| Used by | [The web app](app-web.md) |

## Every file

### `packages/feature/`

| File | What it does |
|---|---|
| `package.json` | The package manifest: its name, its build, test and type-check scripts, and its dependencies. Versions come from the workspace catalog. |
| `tsconfig.json` | TypeScript settings. Extends a shared preset from `tooling/tsconfig` and type-checks the tests too. |
| `tsup.config.ts` | Build settings: bundles `src/` into `dist/` as ES modules with type declarations. |
| `vitest.config.ts` | Test runner settings. Resolves sibling packages to their source, so tests never run against a stale build. |
| `vitest.setup.ts` | Runs before the tests: cleans up rendered components between tests. |

### `packages/feature/src/`

| File | What it does |
|---|---|
| `import.ts` | Every import from outside this package, written once and re-exported, so the rest of `src/` imports from one place. |
| `index.ts` | The package's public entry point. Re-exports what other packages may use, and contains no logic. |

### `packages/feature/src/account/`

| File | What it does |
|---|---|
| `active-session.list.tsx` | `ActiveSessionList`: the "where you are signed in" list, with a button to sign out each other device. |
| `change-email.form.tsx` | `ChangeEmailForm`: asks for a new email address; a confirmation link goes to the current address first. |
| `change-password.form.tsx` | `ChangePasswordForm`: changes your password and signs out your other devices. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `linked-account.list.tsx` | `LinkedAccountList`: the ways you can sign in (password, Google), with link and unlink. You cannot unlink your last one. |
| `profile.form.tsx` | `ProfileForm`: edits your display name. |
| `two-factor.panel.tsx` | `TwoFactorPanel`: when two-factor is on: turn it off, or replace your backup codes (both need your password). |
| `two-factor.setup.tsx` | `TwoFactorSetup`: turning two-factor on in three steps: confirm your password, scan the QR code, type a code to prove it worked. Shows backup codes once. |

### `packages/feature/src/apikey/`

| File | What it does |
|---|---|
| `api-key.list.tsx` | `ApiKeyList`: the API key list with status and a revoke button that asks for confirmation. |
| `create-api-key.form.tsx` | `CreateApiKeyForm`: creates a key with a name, permissions you hold and an optional expiry, then shows the secret once until dismissed. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `use-api-key-failure.ts` | `useApiKeyFailure`: turns an API key error into the right sentence (not allowed at all, a permission you do not hold, a bad expiry). |

### `packages/feature/src/auth/`

| File | What it does |
|---|---|
| `forgot-password.form.tsx` | `ForgotPasswordForm`: asks for an email and always shows the same confirmation, so it never reveals whether an account exists. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `password-pair.tsx` | `PasswordPair`: the "password" and "confirm password" fields with their rules, shared by sign-up, reset and change. |
| `reset-password.form.tsx` | `ResetPasswordForm`: sets a new password using the token from the reset email. |
| `session.context.tsx` | `SessionProvider` and hooks (`useSession`, `useCapabilities`, `useIsPlatformOrganization`): the signed-in person, their organizations, the active one, their permissions and their flags, available to every component. |
| `sign-in.form.tsx` | `SignInForm`: email and password sign-in. Moves on to the two-factor step when needed; one generic message for a wrong email or password. |
| `sign-out.button.tsx` | `SignOutButton`: signs out, then lets the app clear its cache and navigate. |
| `sign-up.form.tsx` | `SignUpForm`: creates an account, then shows the "check your email" notice. |
| `social-sign-in.tsx` | `SocialSignIn`: the "Continue with Google" button, shown only when Google sign-in is configured. |
| `two-factor.form.tsx` | `TwoFactorForm`: the second sign-in step: an authenticator code, an emailed code, or a backup code. |
| `verify-email.notice.tsx` | `VerifyEmailNotice`: "check your inbox" after sign-up, showing the address and a resend button. |

### `packages/feature/src/doc/`

| File | What it does |
|---|---|
| `doc-access.panel.tsx` | `DocAccessPanel`: the editor's access-link pickers (module, permission, flag, plan) for a space or page, warning about a key the server no longer knows. |
| `doc-appearance.panel.tsx` | `DocAppearancePanel`: the docs sidebar footer: pick a theme and light or dark. |
| `doc-copy.button.tsx` | `DocCopyButton`: copies a page's Markdown source to the clipboard. |
| `doc-editor.form.tsx` | `DocEditorForm`: the page editor: title, description, slug, icon, Markdown with live preview, image upload, access links, autosave of the draft, and Publish. It reports unsaved edits, so the route can ask before leaving. |
| `doc-grant.panel.tsx` | `DocGrantPanel`: lists who a granted platform space is open to and adds or removes grants (organization, person or plan, with reason and end date). |
| `doc-nav-tree.ts` | `DocNavTree`: turns a space's published sidebar data into links for the sidebar, breadcrumbs, previous/next and the search palette, so they all agree. |
| `doc-page-tree.list.tsx` | `DocPageTreeList`: the editor's page tree, drafts included, with adding, moving and reordering pages. |
| `doc-reader.panel.tsx` | `DocReaderPanel`: the whole docs reader: sidebar with space switcher and search, breadcrumbs, the page, Copy Markdown and the Open menu (ChatGPT, Claude, GitHub), previous and next, and "On this page". Serves both `/doc` and `/docs`. |
| `doc-revision.list.tsx` | `DocRevisionList`: a page's published versions, newest first, with Restore (back into the draft). |
| `doc-search.panel.tsx` | `DocSearchPanel`: the docs search palette. Titles in the open space match instantly; full-text results from every readable space are grouped by space. |
| `doc-space-switcher.button.tsx` | `DocSpaceSwitcherButton`: the switcher between doc spaces at the top of the sidebar, hidden when there is only one. |
| `doc-space.form.tsx` | `DocSpaceForm`: create or edit a space: title, slug, description, icon, audience, theme, GitHub link, access link, and delete. |
| `doc-space.list.tsx` | `DocSpaceList`: a grid of cards, one per space, shown before a space is chosen. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/feature/src/document/`

| File | What it does |
|---|---|
| `document.search.tsx` | `DocumentSearch`: the AI document search box and its results. |
| `index-document.form.tsx` | `IndexDocumentForm`: paste a document's text to queue it for indexing. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |

### `packages/feature/src/error/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `use-error-message.ts` | `useErrorMessage`: turns whatever an API call threw into the right sentence in the user's language, plus per-field messages. |

### `packages/feature/src/i18n/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `message.context.tsx` | `MessageProvider`, `useTranslator` and `useMessages`: makes translated text available to components and loads more namespaces as pages need them. |

### `packages/feature/src/member/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `invitation-list.tsx` | `InvitationList`: pending invitations with resend and revoke. |
| `invite-member.form.tsx` | `InviteMemberForm`: invite by email into a role, offering only roles you are allowed to hand out. |
| `member-access.panel.tsx` | `MemberAccessPanel`: one member's access in one place: their exceptions, a form to add one, and their effective permissions with where each came from. |
| `member-count.tsx` | `MemberCount`: the number of members, for the dashboard card. |
| `member-list.tsx` | `MemberList`: the members table with role, status (deactivated, or suspended by the platform), Change role, and deactivate or reactivate. |
| `use-assignable-roles.ts` | `useAssignableRoles`: which roles the viewer may hand out, and whether they may change a given member. |

### `packages/feature/src/nav/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `module-nav.tsx` | `ModuleNav`: the main menu: the menu entries from content, shown only for modules the person may see. |

### `packages/feature/src/notification/`

| File | What it does |
|---|---|
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `notification-bell.button.tsx` | `NotificationBell`: the bell in the header with an unread badge ("99+" past 99) that opens a peek of unread items. |
| `notification-peek.list.tsx` | `NotificationPeek`: the newest unread notifications inside the bell's popup, with a link to the inbox. |
| `notification-preference.form.tsx` | `NotificationPreferenceForm`: the preferences grid: for each category and channel, instant, daily digest or off. |
| `notification.list.tsx` | `NotificationList`: the full inbox, with mark read and load more. |

### `packages/feature/src/organization/`

| File | What it does |
|---|---|
| `create-organization.form.tsx` | `CreateOrganizationForm`: founds a new organization and switches into it. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `invitation-accept.tsx` | `InvitationAccept`: the invitation landing page: who invited you to what, and sign in, sign up or accept. |
| `organization-switcher.tsx` | `OrganizationSwitcher`: the dropdown that switches your active organization or starts a new one. |

### `packages/feature/src/platform/`

| File | What it does |
|---|---|
| `account.panel.tsx` | `AccountPanel`: the super admin's account screen: look a person up by email, see their memberships, suspend or reinstate them, and add or clear platform denies. |
| `delete-tenant.panel.tsx` | `DeleteTenantPanel`: delete an organization by typing its slug to confirm. |
| `flag.list.tsx` | `FlagList`: every feature flag with owner and expiry, its global switch and per-organization targets. |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `module-switch.panel.tsx` | `ModuleSwitchPanel`: the emergency module kill switches, each needing a reason to turn off. |
| `organization-entitlement.panel.tsx` | `OrganizationEntitlementPanel`: one organization's plan, its adjustments, and how much of each role the plan lets through. |
| `plan.form.tsx` | `PlanForm`: create or edit a plan by ticking permissions, with dependencies ticked automatically. |
| `plan.list.tsx` | `PlanList`: every plan, how many organizations use it, and which is the default. |
| `platform-nav.tsx` | `PlatformNav`: the platform menu: each super admin page you hold the permission for, plus team, roles and docs while inside the platform organization. |
| `platform-status.panel.tsx` | `PlatformStatusPanel`: the status page's health table (up, down, or not configured). |
| `replica-switch.panel.tsx` | `ReplicaSwitchPanel`: turn heavy reads on the read-only copy on or off, shown only when a replica exists. |
| `tenant-export.panel.tsx` | `TenantExportPanel`: start an export of one organization and download the finished files. |

### `packages/feature/src/rbac/`

| File | What it does |
|---|---|
| `capabilities-from-wire.ts` | `capabilitiesFromWire`: turns permission strings from the API into a `CapabilitySet`, ignoring keys the catalog no longer knows. |
| `create-role.form.tsx` | `CreateRoleForm`: creates an empty role by name and description. |
| `effective-permissions.inspector.tsx` | `EffectivePermissionsInspector`: what one person can do, and why, for each permission (platform deny, organization deny, plan, exception, role). |
| `index.ts` | Folder index: re-exports the files beside it, so other folders import the folder rather than its files. |
| `permission-matrix.tsx` | `PermissionMatrix`: a grid of permissions (rows) by roles or people (columns), with ticks you can toggle where allowed. |
| `permission-override.form.tsx` | `PermissionOverrideForm`: give or take away one permission from one person, with a reason and an end date for grants. |
| `permission-override.list.tsx` | `PermissionOverrideList`: one person's exceptions. A platform deny shows a lock and cannot be cleared here. |
| `role-list.tsx` | `RoleList`: the roles table with rename and delete. |
| `role-matrix.tsx` | `RoleMatrix`: the permission grid for every role, greying permissions the plan does not include. |
| `use-role-failure.ts` | `useRoleFailure`: turns a role error into the right sentence (name taken, still in use, reserved, not one you hold). |

### `packages/feature/tests/account/`

| File | What it does |
|---|---|
| `active-session.list.spec.tsx` | Tests `active-session.list.tsx`. |
| `change-email.form.spec.tsx` | Tests `change-email.form.tsx`. |
| `change-password.form.spec.tsx` | Tests `change-password.form.tsx`. |
| `linked-account.list.spec.tsx` | Tests `linked-account.list.tsx`. |
| `two-factor.panel.spec.tsx` | Tests `two-factor.panel.tsx`. |
| `two-factor.setup.spec.tsx` | Tests `two-factor.setup.tsx`. |

### `packages/feature/tests/apikey/`

| File | What it does |
|---|---|
| `api-key.list.spec.tsx` | Tests `api-key.list.tsx`. |
| `use-api-key-failure.spec.tsx` | Tests `use-api-key-failure.ts`. |

### `packages/feature/tests/auth/`

| File | What it does |
|---|---|
| `password-pair.spec.tsx` | Tests `password-pair.tsx`. |
| `reset-password.form.spec.tsx` | Tests `reset-password.form.tsx`. |
| `session.context.spec.tsx` | Tests `session.context.tsx`. |
| `sign-in.form.spec.tsx` | Tests `sign-in.form.tsx`. |
| `sign-up.form.spec.tsx` | Tests `sign-up.form.tsx`. |
| `two-factor.form.spec.tsx` | Tests `two-factor.form.tsx`. |

### `packages/feature/tests/doc/`

| File | What it does |
|---|---|
| `doc-reader.panel.spec.tsx` | Tests the docs reader: previous/next across sections, Open in AI links, access links. |
| `doc-search.panel.spec.tsx` | Tests `doc-search.panel.tsx`. |

### `packages/feature/tests/i18n/`

| File | What it does |
|---|---|
| `message.context.spec.tsx` | Tests `message.context.tsx`. |

### `packages/feature/tests/member/`

| File | What it does |
|---|---|
| `invitation-list.spec.tsx` | Tests `invitation-list.tsx`. |
| `invite-member.form.spec.tsx` | Tests `invite-member.form.tsx`. |
| `member-list.spec.tsx` | Tests `member-list.tsx`. |

### `packages/feature/tests/notification/`

| File | What it does |
|---|---|
| `notification-bell.button.spec.tsx` | Tests `notification-bell.button.tsx`. |
| `notification-preference.form.spec.tsx` | Tests `notification-preference.form.tsx`. |
| `notification.list.spec.tsx` | Tests `notification.list.tsx`. |

### `packages/feature/tests/organization/`

| File | What it does |
|---|---|
| `invitation-accept.spec.tsx` | Tests `invitation-accept.tsx`. |
| `organization-switcher.spec.tsx` | Tests `organization-switcher.tsx`. |

### `packages/feature/tests/platform/`

| File | What it does |
|---|---|
| `account.panel.spec.tsx` | Tests `account.panel.tsx`. |
| `flag.list.spec.tsx` | Tests `flag.list.tsx`. |
| `plan.form.spec.tsx` | Tests `plan.form.tsx`. |
| `platform-nav.spec.tsx` | Tests the platform menu shows each page only with its permission. |

### `packages/feature/tests/rbac/`

| File | What it does |
|---|---|
| `permission-matrix.spec.tsx` | Tests `permission-matrix.tsx`. |
| `permission-override.spec.tsx` | Tests the override list and form, including locked platform denies. |
| `role-matrix.spec.tsx` | Tests `role-matrix.tsx`. |
| `use-role-failure.spec.tsx` | Tests `use-role-failure.ts`. |

### `packages/feature/tests/support/`

| File | What it does |
|---|---|
| `render-with-fakes.tsx` | Test helper: renders a component with fake session, permissions, text and API client. |
| `select.ts` | Test helper: picks an option in a `Select` the way a pointer does. |
| `transport-error.ts` | Test helper: builds the error shape a component really receives from the API. |

### `packages/feature/docs/`

| File | What it does |
|---|---|
| `index.md` | Components that fetch and mutate — the auth screens, the message provider, the member, doc and platform panels. Mountable under any routing shell, because navigation arrives as a prop. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |

### `packages/feature/docs/reference/`

| File | What it does |
|---|---|
| `message-narrowing.md` | Why useMessages takes the namespace as its only argument, why the two-argument shape that looks equivalent constrains nothing, and why a missing key renders as itself. |
| `meta.json` | Sidebar title, description and page order for this docs folder. |
