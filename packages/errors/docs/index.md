---
title: errors
description: One failure shape every runtime throws, serialises and reconstructs — carrying structured context and no prose, because content owns every word a user reads.
---

# `@loadbearing/errors`

A failure is understood in four places — the use-case throwing it, the transport mapping it to a
status, the component rendering it, the worker logging and maybe retrying it. This is their shared
vocabulary.

```
packages/errors/
├── src/
│   ├── index.ts              ← no import.ts: this package takes nothing from outside
│   ├── catalog/              ← one fragment per slice, team-owned
│   │   ├── index.ts          ←   ERROR_CATALOG, ErrorCode, ErrorMeta, ErrorSeverity
│   │   └── core.errors.ts
│   ├── error/                ← the base class and one subclass per code with context
│   │   ├── app.error.ts      → AppError, ErrorEnvelope, FieldViolation, TransportError
│   │   ├── forbidden.error.ts · not-found.error.ts · conflict.error.ts
│   │   ├── unauthorized.error.ts · two-factor-required.error.ts
│   │   ├── validation.error.ts · internal.error.ts
│   │   ├── rate-limited.error.ts · unavailable.error.ts  ★ thrown by adapters only
│   │   └── server-only.error.ts   ★ thrown by core, at module load
│   ├── normalizer/
│   │   └── error-normalizer.ts → ErrorNormalizer
│   └── transport/
│       └── http.ts           → HTTP_STATUS   ★ adapters only, never the domain
└── tests/
    ├── error/{app,server-only,validation}.error.spec.ts
    └── normalizer/error-normalizer.spec.ts
```

Zero dependencies, the root of the workspace graph — any dependency would exclude one of those
runtimes. `core` depends on *this* package because
[`ServerOnly.assert`](../../core/docs/reference/server-only.md) throws, and nothing here throws a bare
`Error`.

---

## The rule everything else follows from

**An error carries no message.** `Error.message` is the code:

```ts
new ForbiddenError("task.reactivate").message; // "FORBIDDEN"
```

Every user-facing word lives in [`@loadbearing/content`](../../content/docs/index.md), keyed by code
and translated — the split `permissions` draws (it owns `PermissionKey`, `content` the label, and
`content` may not name a permission). With no message there is nothing to leak, forget to translate or
match on:

- **Logs get fields, not sentences.** `{ code, permission, goalId }` is what you filter on at 3am.
- **The server never sends prose.** It sends `{ code, context }`; the client renders in *its* locale.
  A desktop app running in a different language than the server is correct for free.
- **A reporter groups by code**, rather than fragmenting one bug into a thousand interpolated strings.

> [!WARNING]
> Do not add "just a short developer message" to the base class: once it exists something renders it (a
> toast, a pasted log line, an error-boundary `<pre>`), and user-facing text escapes `content` and
> translation. Structured `context` covers every legitimate use.

### There is no exception, including the one that used to exist

`ServerOnly.assert` is the hardest case — module load, a developer's console, no wire — and it throws
`ServerOnlyError` (code `SERVER_ONLY`, context `{ package }`); its old inline sentence is now `content`'s
`error.serverOnly`.

```ts
new ServerOnlyError("@loadbearing/infrastructure").message;   // "SERVER_ONLY"
ErrorCopy.message(translator, error.toJSON());    // "@loadbearing/infrastructure was imported into a client …"
```

Nothing was lost; the words are now translatable, and the throw site keeps a greppable code and a
filterable field ([the full argument](../../core/docs/reference/server-only.md#why-the-hardest-case-for-prose-still-loses)).

---

## The four exports

### [`AppError`](reference/app-error.md) — the shape

```ts
throw new ForbiddenError("task.reactivate", goalId);

error.code;        // "FORBIDDEN"  — a closed union, switchable
error.context;     // { permission, goalId }  — interpolated into copy
error.retryable;   // read from the catalog, not restated
error.toJSON();    // the wire envelope
AppError.from(envelope);  // reconstructed on the client, or null if the code is unknown
```

`toJSON()`/`from()` is `CapabilitySet`'s idiom — throw on the server, JSON on the wire, a branchable
class on the client. `from()` returns `null` for an unknown code: an envelope is untrusted input.

### [`ErrorNormalizer`](reference/error-normalizer.md) — the handler

```ts
ErrorNormalizer.normalize(anythingAtAll); // → AppError, always
```

| Thrown | Becomes |
| --- | --- |
| an `AppError` | itself |
| a Zod-shaped error | `ValidationError` with `{ field, rule, params }` |
| an `Error`, a string, `undefined`, `null`, a number | `INTERNAL`, original kept off the envelope |

### [`ERROR_CATALOG`](reference/catalog.md) — the vocabulary

Team-owned fragments merged by a platform barrel, like the permission catalog;
`ErrorCode = keyof typeof ERROR_CATALOG` is closed. Metadata is transport-agnostic: `retryable` is read by
both `query` and the worker so they cannot disagree; `severity` separates "tried something not allowed"
from "we are broken".

### `HTTP_STATUS` — quarantined on purpose

Total over `ErrorCode` (a new code needs a status to compile). `application` may not import it —
`ForbiddenError` is domain, `403` transport, and that split keeps the transport swappable; ESLint bans the
import name.

---

## Testing

32 tests; the ones worth knowing:

- **`normalize()` is total** — `Error`, string, `undefined`, `null`, number and plain object all yield a
  valid envelope.
- **No original text escapes** — a Postgres-flavoured `Error("… relation \"user_api_keys\" …")` is
  normalised and the table name asserted absent from `JSON.stringify(envelope)`.
- **Zod's default message is discarded**, against a realistic issue carrying one.
- **Structural detection works across package copies**, and an unknown code is not mistaken for ours.
- **The catalog and `HTTP_STATUS` have not drifted.**
- **`ServerOnlyError`'s context key is `package`** — the `error.serverOnly` placeholder; `content` pins
  the other end.

```bash
pnpm --filter @loadbearing/errors test
```

---

## See also

- [AppError](reference/app-error.md) · [ErrorNormalizer](reference/error-normalizer.md) · [catalog](reference/catalog.md)
- [`@loadbearing/content`](../../content/docs/reference/error-copy.md) — the other half: `ERROR_COPY`, `ErrorCopy`
- [`@loadbearing/core`](../../core/docs/reference/server-only.md) — the one caller that throws at module load
- [`@loadbearing/permissions`](../../permissions/docs/index.md) — the same codes-here/copy-there split
