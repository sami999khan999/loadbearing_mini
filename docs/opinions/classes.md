---
title: Classes and methods
description: Plain role nouns for seams, technology prefixes for implementations, and a closed method vocabulary.
---

# Classes and methods

## Class names

| Kind | Convention | Example |
|---|---|---|
| Abstract seam | Plain role noun — **no `I`, no `Abstract`** | `VectorStore`, `AuthStrategy`, `Clock` |
| Concrete implementation | **Technology prefix** + the seam name | `PgVectorStore`, `S3StorageGateway`, `SystemClock` |
| Test double | `Fake` or `Fixed` prefix | `FakeTaskRepository`, `FixedClock` |
| Use-case | `<Verb><Noun>UseCase` | `ReactivateTaskUseCase` |
| Repository | `<Aggregate>Repository` | `TaskRepository` |
| Entity | `<Noun>Entity` | `TaskEntity` |
| Contract | `<Noun>Contract` | `TaskContract` |
| Error | `<Reason>Error` | `ForbiddenError` |
| Registry | `<Noun>Registry` | `PermissionRegistry` |

The technology prefix makes a seam visible: `PgVectorStore` in the `Container` and `VectorStore`
everywhere else shows exactly where a Qdrant swap happens.

**Banned suffixes: `Manager`, `Helper`, `Util`, `Handler`, bare `Service`** — they describe nothing.
A class fitting none of `UseCase`, `Repository`, `Gateway`, `Store`, `Reader`, `Logger`, `Provider`,
`Publisher`, `Resolver`, `Renderer`, `Rules`, `Subscriber`, `Policy`, `Strategy`, `Entity`,
`Registry` probably wants splitting.

- `Policy` is a domain rule too broad for one entity.
- `Rules` is what several writes over one subject share — `RoleRules` exists because a create that
  allows what an update refuses is a hole reachable by creating, then editing.
- A `Renderer` turns data into a document and touches no transport.
- A `Reader` reads and never writes — a write method on `LogReader` would silently make a derived
  store authoritative ([Data and scale](data-and-scale.md) §2).

Every suffix names a port that exists. Adding one means a row here and in [Files](files.md) — the
friction that keeps `Manager` out. **`Bus` was removed:** an `EventBus` port was declared, faked and
deleted with no adapter, and the design that finally landed was a publisher, a gateway and
subscribers. A list naming a shape nobody built is what this list must not be.

## Methods

| Pattern | Rule | Example |
|---|---|---|
| Use-case entry | Always `execute` | `execute(principal, input)` |
| Repository read, nullable | `findBy<X>` | `findById` |
| Repository read, throwing | `findBy<X>OrFail` | `findByIdOrFail` |
| Repository write | `save`, `delete` — never `update`/`insert` | `save(entity)` |
| Existence | `exists<X>` | `existsByEmail` |
| Mapping | `toDto` / `fromDto` / `toEntity` | `TaskEntity.fromDto(dto)` |
| Factory | `static from<X>` or `static create` | `CapabilitySet.from(dto)` |
| Boolean | `is` / `has` / `can` / `should` prefix | `isLockedFromAssignee()` |
| Assertion (throws) | `assert<X>` | `authorizer.assert(...)` |
| Predicate (returns) | `can<X>` | `capabilities.can(...)` |
| Aggregate read | the metric, pluralised | `dailyCounts(from, to)` |

- **An aggregate read has no verb prefix on purpose** — it returns numbers over a window, not
  entities, so `findByDailyCount` would lie. Keep any permitted scope in the signature; a derived
  store cannot resolve a `CapabilitySet`.
- **`can()` answers; `assert()` enforces.** Mixing them is how a UI check silently becomes the only
  check.

## Accessibility is explicit

`public`, `private` or `protected` on every member, enforced by Biome's
`style/useConsistentMemberAccessibility` (`accessibility: "explicit"`). An unmarked member is public
by accident — `export *` one level down.

## No exported free functions in the OOP packages

`core`, `permissions`, `errors`, `observability`, `contracts`, `application`, `infrastructure`,
`auth`, `composition`, `api-client`, `asset`, `content` export classes; static methods on a class with
a private constructor is the shape (`Locales`, `Results`, `ErrorNormalizer`). Enforced by ESLint
`no-restricted-syntax` over `packages/{…}/src/**/*.ts` (`tooling/eslint-config/src/index.js`), with
Biome's `complexity/noStaticOnlyClass` off to allow it.

**Scope is the shipped surface:** `src/` only (a spec's local `harness()` has no API to keep
coherent) and exported only (a module-private helper is fine). What it prevents is a barrel half
classes, half loose functions, with no answer to where the next one goes. **`ui`, `query` and
`feature` are exempt** (components and hooks are functions), and `apps/*` is outside the glob.

## No static mutable state

`static readonly` holding a `Map` freezes the reference, not the contents. Build derived lookups once
at module load and freeze them:

```ts
// packages/permissions/src/registry/permission-registry.ts
const ALL_KEYS: readonly PermissionKey[] = Object.freeze(Object.keys(CATALOG) as PermissionKey[]);
```

Enforced by ESLint `no-restricted-syntax`.
