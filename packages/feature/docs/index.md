---
title: "@loadbearing/feature"
description: Components that fetch and mutate — the auth screens, the message provider, the member, doc and platform panels. Mountable under any routing shell, because navigation arrives as a prop.
---

# `@loadbearing/feature`

Where data, presentation, copy and permissions meet. Two bans define it, unwriteable rather than
discouraged:

**No `@loadbearing/api-client`.** Every read is a defined query in [`query`](../../query/docs/index.md) —
else `await client.task.list()` in a component is an uncached read no invalidation touches.

**No router.** Navigation arrives as a callback prop (`onSuccess`) or an `href`, so a Tauri shell can mount
these under its own router.

| | |
| --- | --- |
| **Package** | `@loadbearing/feature` (private, never published) |
| **Entrypoint** | `src/index.ts` — opens with `"use client"` |
| **Depends on** | `content`, `contracts`, `errors`, `permissions`, `query`, `ui` |
| **Type-only** | `api-client` — a `devDependency`, because `AuthClient` arrives as a prop |
| **Peers** | `react`, `react-dom` |

```
packages/feature/src/
├── index.ts                                → "use client" on line 1
├── import.ts                               → the two bans, made visible
├── i18n/                                   → MessageProvider, useMessages, useTranslator
├── error/                                  → useErrorMessage
├── nav/                                    → ModuleNav
├── auth/                                   → SessionProvider, useSession, useCapabilities, useFlags,
│                                             the sign-in, sign-up, reset and 2FA forms, PasswordPair
├── account/                                → profile, email, password, two-factor, sessions, linked accounts
├── organization/                           → CreateOrganizationForm, OrganizationSwitcher, InvitationAccept
├── member/                                 → MemberList, MemberCount, MemberAccessPanel, InviteMemberForm, InvitationList
├── rbac/                                   → PermissionMatrix, RoleMatrix, RoleList, CreateRoleForm,
│                                             EffectivePermissionsInspector, the override forms
├── apikey/ notification/ document/ doc/ messaging/ assistant/  ← one folder per product slice
└── platform/                               → the platform admin panels (status, plans, flags, modules, tenants)
```

Both bans live in **ESLint**, not Biome: Biome flags `import type` too, and `SignInForm` needs
`import type { AuthClient }`. `@typescript-eslint/no-restricted-imports` with `allowTypeImports: true`,
the core rule `"off"`. Verified by writing the violations: a value `api-client` import errors, as does an
`infrastructure` import via Biome's server-only override.

## `useMessages` narrows to one namespace, and the shape is what makes it work

```tsx
const { t } = useMessages("auth");
t("auth.signIn");       // ✓
t("action.cancel");     // ✓  shell — always loaded
t("nav.roles");         // ✗  compile error
```

- **`N` is inferred from one argument position** before any key — `NamespaceKeys[N]` is not an inference
  site, so `Translator.t` keeps a flat `MessageKey` and narrowing happens here
  ([message narrowing](reference/message-narrowing.md)).
- **The shell is in the union** because every snapshot carries it; `email` cannot be named
  (`N extends ClientNamespace`).
- **`useSyncExternalStore`**, since navigation adds namespaces after mount; `MessageStore` keeps translator
  identity until `ensure()` adds something, or it would re-render forever.

## The session context reconstructs the class from a DTO

```tsx
<SessionProvider user={user} capabilities={dto}>
```

The JSON DTO crosses SSR; `CapabilitySet.from()` rebuilds the server's own `can()` — the
[`permissions`](../../permissions/docs/index.md) round trip, tested first. `useMemo` avoids rebuilding the
`Set`s. Signed out is `CapabilitySet.empty()`; no loading state grants access.

## `<Can>` is the weakest of four surfaces

| | Surface | Where |
| --- | --- | --- |
| 1 | `Authorizer.assert()` in the use-case — **the real gate** | [`application`](../../application/docs/index.md) |
| 2 | `principalMiddleware` in the oRPC handler | `apps/web` |
| 3 | the route guard — stops the page rendering | `apps/web` |
| 4 | `<Can>` — hide affordances that would fail | `ui` |

Removing a permission must remove the nav item **and** return `FORBIDDEN` — UI-only is theatre, API-only
is erroring buttons.

## Two things worth copying from `SignInForm`

- **Branch on the code, never the message** ([`errors`](../../errors/docs/index.md)).
- **The failure is generic** — `t("auth.signInFailed")`; distinguishing "no account" from "wrong password"
  is an account-enumeration oracle.

## Three forms set a password, and they ask the same two questions once

`PasswordPair` renders new-password and confirm with both rules (floor, equality), takes an `idPrefix`,
and `passwordPairReady` is the one submit guard. **The floor is `contracts`' `Password.MIN_LENGTH`, which
`AuthFactory` reads too** (once a literal `12` in four places). `DateFormat.day` in [`ui`](../../ui/docs/index.md)
is the same move: ISO, because the server renders and the browser hydrates.

## Every list renders four states, in one order

Pending → error → empty → list. `data` is `undefined` until answered, so `data ?? []` checked first says
"no members" while loading — and on failure, which is worse.

```tsx
if (query.isPending) return <EmptyState title={shell.t("state.loading")} />;
if (query.isError) return <Callout tone="danger">{shell.t("state.error")}</Callout>;
if (rows.length === 0) return <EmptyState title={t("member.empty")} />;
```

`shell` is `useMessages("common")`; `MemberList` renders `DataTable.Skeleton`, knowing its shape.
**`ActiveSessionList` has a per-row fifth state:** `ActiveSession.current` (computed in
`AccountClient.listSessions`, since the cookie is httpOnly) gets the badge and **no** Revoke — that is
"Sign out on all devices".

## `PermissionMatrix` fetches nothing, and that is the point

Rows are `PermissionRegistry.instance` (in the bundle), answers `CapabilitySet.can()`, and **subjects are
a prop** — roles on an admin screen, two users in a support tool. `EffectivePermissionsInspector` answers
from the session with no `userId`, else `RoleQueries.effective`. `editable` is per subject; a checkbox
needs `onToggle` **and** an editable subject. **Cells render a word** (`state.allowed`/`state.denied`,
with `data-allowed`) — `✓` announces "check mark", and `aria-label` on a `<span>` is rightly rejected.

## Testing

```bash
pnpm --filter @loadbearing/feature test
```

**The test worth writing first** (`tests/rbac/`): one component, two `CapabilitySetDto` fixtures,
different answers — the DTO round trip, session context and `can()` at once. The harness
(`tests/support/render-with-fakes.tsx`) is **async**, built for a future `BundledContentSource`.
`afterEach(cleanup)` is required with `globals: false` ([`ui`](../../ui/docs/index.md)).

## What this package does not have

**No copy of its own for a failure.** `useErrorMessage` renders what was thrown through
[`ErrorCopy`](../../content/docs/reference/error-copy.md), keyed to the server's code (nine components once
showed one generic `state.error`); `useTranslator` exists for it alone.

**No cache-library import** — slices read through [`useAppQuery`](../../query/docs/index.md), so this
package never names `@tanstack/*` (asserted over `src/`; a test harness may mount a `QueryClientProvider`).
