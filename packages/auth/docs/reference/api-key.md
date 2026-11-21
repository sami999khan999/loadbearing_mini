---
title: The API-key model
description: Shown once, stored as a digest, looked up by prefix, compared in constant time — and re-intersected with the issuer's live capabilities on every request rather than frozen at creation.
---

# The API-key model

`ApiKeyResolver` turns a token into a `Principal`; `ApiKeyHasher` holds only what that needs.

**`ApiKeyRepository` once lived here** ("no use-case should know keys exist"), until a settings page made
issuing a key a domain operation on `apikey.manage` with an audit row, scope check and `UnitOfWork`; the
port moved to `packages/application/src/apikey/`, and `PgApiKeyRepository` serves both. The surviving
split is in *shapes*: `ApiKeyRecord` (with `tokenHash`) is what authentication reads, `ApiKeySummary` (no
hash field) what a list renders — a digest absent from the type cannot leak via a careless DTO. Minting
moved too: `ApiKeyRules` owns the format (`rk_` marker, eight-character prefix), since two copies would
drift into keys that authenticate against nothing.

## The token is shown once and never stored

```ts
const bytes = crypto.getRandomValues(new Uint8Array(32));
const token = `rk_${hex(bytes)}`;
return { token, prefix: token.slice(0, 8), hash: await sha256(token) };
```

`token` is returned once and never written; the row holds `prefix` and `tokenHash`, so a dump has no
usable credential and "I lost it" means a new key. 256 CSPRNG bits; `crypto` comes off `globalThis`,
as `ServerOnly` reaches `window`, since `lib: ["ES2024"]` declares neither.

## The prefix is an index, not an identifier

Eight indexed characters — otherwise authentication scans every key. **Prefixes may collide:** the
repository returns *candidates* and the hash picks one; returning the first would authenticate one
integration as another (`tests/apikey/api-key.resolver.spec.ts` pins this).

## `timingSafeEqual` costs nothing here and closes a question

```ts
if (a.length !== b.length) return false;
let diff = 0;
for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
return diff === 0;
```

It runs a few times per request over 64-character digests; the length short-circuit never fires (always
SHA-256 hex). It is here less for the attack than to settle the question for every reviewer.

## Re-intersection is the part that matters

```ts
const declared = CapabilitySet.from({ wildcard: false, org: { grants: scoped, denies: [] }, goals: {} });
const issuer   = await this.capabilities.forUser(record.organizationId, record.issuerId);
const effective = declared.intersect(issuer);
```

**Scopes are re-intersected with the issuer's *live* capabilities on every request.** Frozen, revoking
the issuer's `rbac.role.manage` would leave all their keys managing roles, unnoticed; re-intersected,
keys narrow with the person, via the same [`CapabilityCache`](capability-cache.md) as their session.
**The issuer's membership is checked too** (`MembershipReader.isActive`, in parallel) — once missing
(`CR.2`), so a deactivated member's keys kept working (grants within the cache minute, `core` keys
forever). Scopes are first filtered by `PermissionRegistry.isKnown()`: a pre-rename row is a stale
string, never a grant, and never a throw — a stale key is a 401, not a 500.

## Revocation and expiry are checked before the key is recorded as used

```ts
if (record.revokedAt) return null;
if (record.expiresAt && record.expiresAt <= now) return null;
…
await this.repository.touch(record.id, now);
```

`touch` records only *successful* use — a last-used stamp on a revoked key would mislead an operator
judging whether a leaked key was used. **It is throttled in the predicate:** unthrottled it is an `UPDATE`
per request on the hottest read path for a "roughly when" column; the row is rewritten only if
`last_used_at` is null or older than `notBefore` (`ApiKeyRules.TOUCH_THROTTLE_MS`, five minutes).

## Issuing, listing and revoking

Three use-cases in `application/src/apikey/`, gated on `apikey.read` and `apikey.manage`, behind
`/settings/api-keys`.

- **No scope the issuer lacks.** Re-intersection (above) would make it grant nothing — until the issuer
  is promoted and the key silently widens.
- **A key cannot issue a key** (`CR.3`): the child belongs to the *issuer*, so a leaked short-lived key
  with `apikey.manage` could mint a permanent sibling surviving its revocation. `CreateApiKeyUseCase`
  refuses any `api_key` principal — keys are made by a signed-in person.
- **Revocation is a timestamp; the row stays** for the audit trail. Re-revoking is idempotent and keeps
  the *first* timestamp, the one an incident review reads.
- **The plaintext exists in one response shape**, `ApiKeyContract.created`, once — never in the query
  cache, the list or the audit row (which records prefix and scopes).

## What is missing on purpose

**No per-key rate limit** (Better Auth limits auth endpoints; per-key budgets belong to metering, not
shipped) **and no scope hierarchy** (`rbac.*` would make intersection ambiguous; the catalog is flat for
that reason).
