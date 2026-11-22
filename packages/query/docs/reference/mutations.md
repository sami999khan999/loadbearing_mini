---
title: Mutations and invalidation
description: Why useAppMutation invalidates before onSuccess, how a declared optimistic edit rolls itself back, why sign-out and organization switch declare no invalidation at all, and the rule for deciding what each mutation invalidates.
---

# Mutations and invalidation

Every mutation is a static factory on a class (`SessionMutations.useSignIn(auth)`,
`AccountMutations.useChangePassword(client)`) — fine, since hook rules apply at the call site. The split
follows `AuthClient`/`AccountClient`: `SessionMutations` is what an anonymous visitor can start,
`AccountMutations` what a signed-in person changes about their own account.

## Invalidate before `onSuccess`

`useAppMutation` runs `invalidates` **before** the caller's `onSuccess` — a caller navigating in
`onSuccess` must land on an already-stale cache, or the destination renders the value just changed.

## The three states of `invalidates`

**A key.** The ordinary case: the mutation changed something a query reads.

| Mutation | Invalidates | Why |
|---|---|---|
| `useUpdateName` | `["session"]` | The rendered name lives on the session snapshot |
| `useVerifyTotpEnrolment` | `["session"]` | The moment two-factor actually becomes true — `user.twoFactorEnabled` is what the security page renders |
| `useChangePassword` | the session **list** | `revokeOtherSessions` is set, so every other device is gone and the list on screen is wrong. This tab's own session survives, which is why `QueryKeys.session` is absent |
| `useInvite`, `useRevokeInvitation` | `member.all()` | A re-invite replaces a pending row and the member list sits beside it, so both refetch together |
| `useVerifyTotp`, `useVerifyBackupCode`, `useVerifyOtp` | `session.all()` | Each one completes a sign-in that answered `TWO_FACTOR_REQUIRED`, so the session the route is about to read is the one that just came into being |

**Nothing, because nothing changed yet.** These are not omissions:

| Mutation | Why no invalidation |
|---|---|
| `useSignUp` | No session is issued — verification is required and `autoSignIn` is off — so invalidating `["session"]` refetches a session that is still, correctly, anonymous |
| `useChangeEmail` | A confirmation was sent to the *old* address; the address on the session moves only once that link is followed |
| `useEnableTwoFactor` | Two-factor is not on yet. Invalidating here makes the page claim protection the account does not have |
| `useSignInWithGoogle`, `useLinkGoogle` | The success path is a full-page navigation to Google. Nothing in this cache survives to be invalidated; the settings page refetches when the browser returns |
| `useSendOtp` | It sends a code and completes nothing. There is no session yet to refetch |

**Nothing, because the whole cache has to go.** Sign-out and the three organization actions.

### `TwoFactorForm` went through the client for a while, and that is the shape to recognise

It used four raw `AuthClient` calls behind a hand-rolled `pending`/`failed` pair, claiming "no session to
invalidate until this succeeds" — but verification is exactly when one appears. **The tell is a local
`useState` reimplementing `isPending`/`isError`:** the seam is not serving that form, and the fix is a
defined mutation. `mutation.reset()` had no hand-rolled equivalent — four mutations keep their own
`isError`, and switching method must not show the old method's failure.

## `optimistic` is a declared edit, not four steps at each call site

Revoking a session or invitation and unlinking an account remove a row the user is looking at — the
row *is* the feedback, and waiting a round trip reads as a dead click. By hand it is four steps, three
of them commonly forgotten:

```ts
optimistic: {
  queryKey: QueryKeys.account.sessions(),
  apply: (cached, { token }) => cached.filter((session) => session.token !== token),
},
```

- **Cancel before writing** — an in-flight refetch would return the *pre*-mutation answer and put the
  row back: an unreproducible flicker.
- **Snapshot, and restore before the caller's `onError`** — a failure message beside the row needs the
  row back.
- **Invalidate the optimistic key on success**, named in `invalidates` or not — or an unconfirmed edit
  lingers.

**`apply` must not mutate the snapshot** — the rollback holds the same object. **A paginated list makes
the hook take its page:** `useRevokeInvitation(client, params)` needs params because they are in the
key — otherwise it edits page one while the reader is on page two. The component builds the object once
for both query and mutation (per-render is fine; keys hash structurally). **An `undefined` cache value
does nothing and restores nothing** — the list is not on screen, and success-invalidation covers it.

## Sign-out and switch clear the cache at the call site

`useSignOut` and every `OrganizationMutations` hook declare no `invalidates`, on purpose: afterwards
**every cached row belongs to the tenant just left**. The only correct answer is `queryClient.clear()`,
a lifecycle decision for the call site (the desktop shell may keep an offline cache). Invalidating only
`["session"]` leaves other queries in memory, so the next person to sign in sees a flash of the previous
user's data. Call sites do four things in order — clear the cache, invalidate the session store, re-run
the root loader, navigate — factored into one `apps/web` helper.

## Key placement

Key rules are in the [package index](../index.md#keys-are-never-written-at-a-call-site). `account` is
deliberately **not** under `session`: linked accounts belong to the user and outlive a session record,
and nesting them would refetch three lists on every session refresh.

## Stale times are backstops, not the mechanism

Every query is invalidated by the mutation changing it; `staleTime` is for the *other* tab — how long
a lie is tolerable:

| Query | Stale time | Why |
|---|---|---|
| Linked accounts, roles, members | a minute | Changed only by a mutation on the same page, each of which invalidates |
| Active sessions, invitations | shorter | A session can end, or an invitation be accepted from another device, with this tab doing nothing — and "where you are signed in" showing a minute-old answer is a screen that lies about the thing it exists for |

Retries come from the error catalog, not per-query settings; a signed-out session query is an answer,
so it never retries.

## A cursor page is one query key, not one per page

`useAppInfiniteQuery` is a pass-through like `useAppQuery`, with the library's five type parameters
copied verbatim (fewer collapse `data` to `unknown`, which typechecks and loses every field). **A keyset
cursor lives in the page data, never the key:** `["notification", "list", { limit, unreadOnly }]` covers
page one and page forty, so one `invalidate` refetches the whole scroll; a cursor in the key gives each
page an entry no ordinary invalidation matches. `getNextPageParam` reads `nextCursor` only —
`items.length < limit` is wrong, since a full last page is ordinary and only the server knows if a row
follows.
