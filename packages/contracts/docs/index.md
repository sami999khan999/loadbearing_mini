---
title: "@loadbearing/contracts"
description: Branded identifiers, the one list envelope, the merged oRPC contract, and the procedure→permission map — the shapes every runtime agrees on.
---

# `@loadbearing/contracts`

Everything that crosses a boundary is described here once — the shape the server validates, the form
checks, the worker parses off a queue and a desktop offline queue rejects. **Isomorphic and I/O-free**
(Zod schemas, entity behaviour, oRPC contracts), so a rule is written once and enforced in four places.

| | |
| --- | --- |
| **Package** | `@loadbearing/contracts` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `zod`, `@orpc/contract`, `@loadbearing/permissions` (type-only) |
| **Used by** | `application`, `infrastructure`, `api-client`, `query`, `ui`, `feature`, `apps/*` |
| **Environment** | isomorphic — server, browser, worker, and Tauri webview |
| **Build** | `tsup` → `dist/index.js` + `dist/index.d.ts` |

```
packages/contracts/
├── vitest.config.ts
├── src/
│   ├── index.ts                     ← the public barrel; names only folder barrels
│   ├── import.ts                    ← zod, @orpc/contract, @loadbearing/permissions
│   ├── primitive/
│   │   ├── index.ts
│   │   ├── identifiers.ts           → Identifiers and the branded ids
│   │   ├── envelope.ts              → Envelope
│   │   ├── pagination.ts            → Pagination, PaginationQuery
│   │   └── password.ts              → Password   ← the bounds AuthFactory enforces
│   ├── procedure/
│   │   └── index.ts                 → contract, AppContract   ← merges every slice's procedures
│   ├── catalog/
│   │   ├── index.ts                 → PROCEDURE_PERMISSIONS, DOMAIN_EVENTS, ACTIVITY_ACTIONS
│   │   ├── <subject>.permissions.ts ← one fragment per slice, procedure path → key
│   │   ├── <subject>.events.ts      ← one fragment per slice, event name → payload schema
│   │   └── <subject>.actions.ts     ← one fragment per slice, audit action → label
│   ├── registry/
│   │   ├── index.ts
│   │   ├── activity-actions.ts      → ActivityActions, ActivityAction
│   │   ├── domain-events.ts         → DomainEvents
│   │   └── procedure-permissions.ts → ProcedurePermissions
│   ├── mail/                        ← a manifest, not a slice: no contract, no procedures
│   │   ├── index.ts
│   │   └── mail-template.manifest.ts → MailTemplates, MailTemplateKey, MailTemplateParams
│   └── <subject>/                   ← one folder per domain subject (role, member, notification, doc, …)
│       ├── index.ts
│       ├── <subject>.contract.ts    → <Subject>Contract   (Zod shapes)
│       ├── <subject>.entity.ts      → <Subject>Entity     (behaviour, no I/O)
│       └── <subject>.procedures.ts  → <Subject>Procedures (oRPC)
└── tests/
    ├── primitive/
    │   ├── identifiers.spec.ts
    │   ├── envelope.spec.ts
    │   └── pagination.spec.ts
    ├── <subject>/…                  ← mirrors src/
    └── registry/procedure-permissions.spec.ts …
```

---

## The four file roles a slice has

| File | Class | Answers |
| --- | --- | --- |
| `<subject>.contract.ts` | `TaskContract` | What shape is this data? |
| `<subject>.entity.ts` | `TaskEntity` | What does this data know about itself? |
| `<subject>.procedures.ts` | `TaskProcedures` | What operations exist, at what path? |
| `catalog/<subject>.permissions.ts` | — | Which permission gates each procedure path? |

The fourth sits in `catalog/`, not the subject folder: a cross-check ("every procedure has a gate") in
`permissions`' fragment pattern — one team, one file. `procedure/` and `catalog/` merge every slice's
fragments; the coverage test runs against the real contract and an `oc` fixture
([procedure-permissions](reference/procedure-permissions.md)). (`Task` in examples is illustrative; no
task slice ships.)

---

## Two conversions that happen in exactly one place

- **Timestamps:** ISO strings in contracts (`z.iso.datetime()`; JSON has no date), `Date` in entities
  (`fromDto`).
- **Identifiers:** strings on the wire, branded in code — parsed once at the boundary
  ([identifiers](reference/identifiers.md)).

## Schemas carry no messages

No `{ message: … }`: Zod's text is discarded and a custom string would be prose outside `content`. A
failed rule becomes `{ field, rule, params }`; `z.string().min(10)` still states the rule once.

`vitest.config.ts` sets `resolve.conditions: ["development"]` so specs resolve `permissions` source, not a
stale `dist/`.

## Two pagination shapes

`Pagination` (`limit` + `offset`) for tenant-bounded lists; `Keyset` (`limit` + opaque `cursor`, no
`total`) for lists that grow with activity — [keyset](reference/keyset.md).

## `mail/` is a manifest, not a slice

No procedure sends a mail template, so no contract/entity/procedures — just a closed record of template
key → params schema, the shape both ends of the mail queue need (the worker distrusts the JSON). **Here by
layering:** `application` has no zod, and `contracts` cannot import `content`, so `Locale` rides the
`MailPublisher` port (type-only to `content`) while params live here. The renderer's `never` default
makes a new key fail to compile until its template and copy exist.

## `DomainEvents` is the same shape as `ProcedurePermissions`, on purpose

Team fragments, merged in `catalog/index.ts`, read through a private-constructor registry: **the name
union is a compile-time check in every layer**, so nothing publishes or subscribes to an undeclared event.
`DOMAIN_EVENTS`, not `EVENT_CATALOG` (observability's log codes — a diagnostic that may be lost, versus a
business fact with a schema and `published_at`; [Vocabulary](../../../docs/opinions/vocabulary.md)). A spec
asserts every name is past tense.

## `ActivityActions` is the third of them, and the reason is the type

Same shape again: fragments in `catalog/`, merged, read through a registry class.
`ActivityLogger.record` takes `ActivityAction`, the key union, rather than a `string`. So an audit
action cannot be written without an entry beside the others, and a typo does not compile.

An entry carries a `label`, not a schema — nothing parses an audit payload; people read it. In the big kit the label is what the analytics projection screen
renders beside each action's toggle. Lite has no such screen, so nothing reads `all()` today; the
entries stay because the type needs them. See [`docs/scale/analytics.md`](../../../docs/scale/analytics.md).

One call site may emit two actions (`set-member-active.use-case.ts`: `member.deactivated` or
`member.reactivated`); both are entries.

**`DomainEvents.envelope` is a discriminated union built at module load** — one `parse` types a job's
JSON, so no consumer picks a schema by `name`. Payloads carry only what subscribers need:
`member.invited` omits the token, which `invitations` stores only hashed.
