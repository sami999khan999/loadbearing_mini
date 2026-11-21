---
title: "@loadbearing/content"
description: Every user-visible string, image reference, and structured record, split by locale and namespace so no runtime downloads words it cannot use. Three content shapes, each with a consumer.
---

# `@loadbearing/content`

The only package allowed to hold a sentence: `errors` names failures with structured context (its
`Error.message` is the code); every word a person reads lives here, keyed and translated.

| | |
| --- | --- |
| **Package** | `@loadbearing/content` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/errors` (type-only), `@loadbearing/asset`, `@loadbearing/permissions` (`ModuleKey`, type-only), `zod` |
| **Used by** | `composition`, `feature`, `apps/web`, `apps/worker` |
| **Environment** | isomorphic and **React-free** — the worker renders email copy with the same class the browser uses |
| **Build** | `tsup` → one chunk per locale × namespace, plus the entry |


```
packages/content/
├── vitest.config.ts               ← resolve.conditions: ["development"], for the errors import
├── src/
│   ├── index.ts                   ← the public barrel; names only folder barrels
│   ├── import.ts                  ← ErrorCode, ErrorEnvelope, FieldViolation from `errors`
│   ├── primitive/
│   │   ├── index.ts
│   │   └── locale.ts              → Locale, Locales
│   ├── translator/
│   │   ├── index.ts
│   │   ├── translator.ts          → Translator, MessageSnapshot
│   │   └── message-store.ts       → MessageStore; `ensure()` adds a namespace after first paint
│   ├── source/
│   │   ├── index.ts
│   │   ├── content-source.ts      → ContentSource (abstract) — the three shapes
│   │   └── static-content.source.ts → StaticContentSource
│   ├── media/                     ── shape 2: media references
│   │   ├── index.ts
│   │   ├── media-ref.ts           → MediaResolver, ResolvedMedia
│   │   └── static-media.resolver.ts → StaticMediaResolver
│   ├── collection/                ── shape 3: repeating records
│   │   ├── index.ts
│   │   └── nav/
│   │       ├── index.ts
│   │       ├── nav.schema.ts      → NavContract, NavItem
│   │       └── nav.data.ts        → navItems
│   └── message/                   ── shape 1: short keyed strings
│       ├── index.ts
│       ├── namespace.ts           → MessageKey, ShellMessageKey, NamespaceBundle, MessageParams
│       ├── catalog.ts             → CLIENT_CATALOG  (locale × namespace → loader)
│       ├── error-copy.ts          → ERROR_COPY, FIELD_RULE_COPY, ErrorCopy
│       ├── catalog.server.ts      → SERVER_CATALOG  (spreads the client one, adds `email`)
│       ├── en/                    ← as const; the key union is derived from these — one file per namespace
│       └── bn/                    ← NamespaceBundle<N>; total, checked by tsc — the same files
└── tests/
    ├── primitive/locale.spec.ts
    ├── translator/translator.spec.ts
    ├── source/
    │   ├── content-source.shapes.spec.ts
    │   └── static-content.source.spec.ts
    ├── media/static-media.resolver.spec.ts
    ├── collection/nav.data.spec.ts
    └── message/error-copy.spec.ts
```

---

## The four ideas

### 1. Copy splits by locale **and** by namespace

Each namespace is its own chunk, fetched per locale: `CLIENT_CATALOG` is a `locale × namespace` grid of
dynamic-import loaders, so an English reader never downloads Bengali or the worker's email copy. A merged
`en` object once dragged every locale into every bundle — **merging was the bug**
([namespace](reference/namespace.md)).

### 2. The key union stays closed anyway

```ts
t("error.frobidden");   // compile error
```

`MessageKey` derives from **type-only** imports of the English files, so a typo fails the build and
`ERROR_COPY` is total — though no module imports the runtime chunks statically.

### 3. Two namespaces are guaranteed; everything else is lazy

`common` and `error` are the *shell*, unioned into every request by `ContentSource.resolve()` — a
property of the seam. Hence `ERROR_COPY: Record<ErrorCode, ShellMessageKey>`: a code pointing into a lazy
namespace would render as a raw key on the one screen that cannot afford it.

### 4. Content references the security surface; it never defines it

Nav items carry `module: "rbac"`, never `permission: "rbac.role.read"` — editors reorder menus, not
gates. ESLint bans `PermissionKey` here ([content shapes](reference/content-shapes.md)).

---

## The error slice, end to end

```ts
// somewhere on the server
throw new ForbiddenError("task.reactivate", goalId);

// at the boundary
const envelope = ErrorNormalizer.normalize(thrown).toJSON();
// { code: "FORBIDDEN", context: { permission: "task.reactivate", goalId } }

// in the client, in the client's locale
const t = await content.translator(locale, []);
ErrorCopy.message(t, envelope);   // "You do not have permission to do that."
```

The server sends no prose, so a client in another language is correct for free. Even `ServerOnlyError`,
once the one error with an inline sentence, renders from `error.serverOnly`
([error-copy](reference/error-copy.md), [core's `ServerOnly`](../../core/docs/reference/server-only.md)).

---

## What exists, and what does not

| Area | State |
| --- | --- |
| `locale.ts`, `translator.ts` | ✅ final |
| `message/en/*`, `message/bn/*` — `common`, `error`, `nav`, `auth`, `account`, `role`, `member`, `organization`, `apikey`, `document`, `doc`, `notification`, `platform`, `email` | ✅ fourteen namespaces per locale |
| `message/namespace.ts` | ✅ fourteen namespaces; `email` is `ServerNamespace`, outside `ClientNamespace` |
| `message/catalog.ts` | ✅ twenty-six cells, total over `Locale × ClientNamespace` |
| `message/error-copy.ts` | ✅ final |
| `content-source.ts`, `static-content.source.ts` | ✅ three shapes declared and implemented |
| `media/` — `MediaResolver`, `StaticMediaResolver` | ✅ final |
| `collection/nav/` — `NavContract`, `navItems` | ✅ final |
| `message/catalog.server.ts` — `SERVER_CATALOG` | ✅ final; `Container` and `TestContainer` pass it to `StaticContentSource` |
| `translator/message-store.ts` — `MessageStore` | ✅ final; `apps/web/src/router.tsx` constructs it, `feature`'s `MessageProvider` reads it |
| `bundled-content.source.ts` — `BundledContentSource` | ☐ lands with a second shell, which is a plan |

**`SERVER_CATALOG` spreads `CLIENT_CATALOG` and adds `email`** with **static** imports — a dynamic
specifier makes rollup emit a chunk into public assets even after tree-shaking. So
`apps/web/src/router.tsx` constructs `new StaticContentSource()` bare, and only
[`Container`](../../composition/docs/reference/container.md) passes the server catalog. Adding a namespace
is additive ([namespace](reference/namespace.md#adding-a-namespace)).

> [!NOTE]
> **`"sideEffects": false` is load-bearing:** a future `BundledContentSource` statically importing every
> locale shares a barrel with `Translator`, and without the flag the Bengali catalog would ride into the
> client chunk.

---

## Testing

55 tests.

```bash
pnpm --filter @loadbearing/content test
```

Worth knowing:

- **Every `ErrorCode` resolves in a snapshot that asked for nothing** (`messages("en", [])`) — catching a
  code pointed at a lazy namespace, which the compiler cannot.
- **The `errors` seam round-trips** — `ServerOnlyError`'s sentence comes out whole.
- **Every `ValidationError` rule has copy**, driven from `ValidationError.fromIssues`.
- **The shell arrives unasked, and no English rides beneath another locale.**
- **An unknown placeholder is left in place.**

---

## See also

- [namespace](reference/namespace.md) · [Translator](reference/translator.md) · [error-copy](reference/error-copy.md) · [ContentSource](reference/content-source.md)
- [`@loadbearing/errors`](../../errors/docs/index.md) — the codes these words are keyed to
