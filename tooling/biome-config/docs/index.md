---
title: "@loadbearing/biome-config"
description: The Biome configuration — formatting, import organisation, and the fast lint rules. One base file the root extends, replacing Prettier entirely.
---

# `@loadbearing/biome-config`

Biome is one Rust binary that formats, organises imports and lints about ten times faster than ESLint
plus Prettier. It replaced Prettier and most linting; [`eslint-config`](../../eslint-config/docs/index.md)
keeps only what Biome cannot express.

| | |
| --- | --- |
| **Package** | `@loadbearing/biome-config` (private, never published) |
| **Holds** | `src/base.json` — the entire configuration |
| **Consumed by** | the root `biome.json`, via a relative `extends` |
| **Dependencies** | none — the `biome` binary is a root devDependency |
| **Build step** | none — JSON, read directly by the Biome CLI |

```
tooling/biome-config/
├── package.json
├── docs/
└── src/
    └── base.json       ← formatter, assist, linter, overrides
```

---

## How it is wired

The root `biome.json` is two lines:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.7/schema.json",
  "extends": ["./tooling/biome-config/src/base.json"]
}
```

> [!IMPORTANT]
> **The link is a relative path, not a package specifier** — `extends: ["@loadbearing/biome-config/src/base.json"]`
> does **not** resolve (verified on 2.5.7, even with an `exports` map); Biome's resolver is not Node's.
> It is a workspace member for organisation only, with no dependencies and nothing importable.

Unlike `tsconfig` and `eslint-config`, it is **not** a resolution target:

| | `tsconfig` / `eslint-config` | `biome-config` |
| --- | --- | --- |
| How the root reaches it | module resolution (`extends`, `import`) | relative file path |
| Declared in root `devDependencies` | yes — required for the symlink | **no** — nothing to resolve |
| Provides the binary | no | no — `@biomejs/biome` at the root does |

`@biomejs/biome` ships only a `bin` (no `main` or `exports`; `require.resolve` fails), so nothing
imports it.

> [!NOTE]
> Verified before splitting this out, since both would fail silently — re-check if the file moves:
> **`overrides.includes` globs resolve against the root config** (`packages/feature/**` is not looked
> for under `tooling/biome-config/`), and **`vcs.useIgnoreFile` still finds the root `.gitignore`**.

---

## What `base.json` configures

### Formatter

```json
"formatter": {
  "enabled": true,
  "indentStyle": "space",
  "indentWidth": 2,
  "lineWidth": 100,
  "lineEnding": "lf"
},
"javascript": {
  "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
}
```

**`lineWidth: 100`, not 80** — mandatory constructor parameter properties (the `parameter-properties`
ESLint rule) are the dominant shape:

```ts
constructor(private readonly tasks: TaskRepository, private readonly clock: Clock) {}
```

At 80 columns every non-trivial one wraps to five or six lines. **`lineEnding: "lf"`** is one leg of a
three-part fix; any two leave a gap:

| Layer | Mechanism | Catches |
| --- | --- | --- |
| Git | `core.autocrlf input` + `.gitattributes` | what gets committed |
| Editor | `.editorconfig` | what gets typed, in editors without a Biome plugin |
| Biome | `lineEnding: "lf"` | what gets written on format |

> [!IMPORTANT]
> Drop one and a single Windows commit shows every line modified — review breaks, and the fix is
> `git add --renormalize .` plus an explanation.

### Import organisation

```json
"assist": { "enabled": true, "actions": { "source": { "organizeImports": "on" } } }
```

An **assist action**, not a lint rule — replacing `prettier-plugin-organize-imports` with nothing to
install.

### Files and VCS

```json
"vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
"files": { "includes": ["**", "!**/dist", "!**/.output", "!**/migrations"] }
```

`.gitignore` is honoured (no `.prettierignore` equivalent needed). `migrations` is excluded — Drizzle
generates it, and reformatting would diff on every `db generate`.

---

## Lint rules

`"preset": "recommended"` plus five deliberate changes.

> [!NOTE]
> `"recommended": true` is deprecated since 2.5; `biome migrate --write` converts old configs.

| Rule | Setting | Why |
| --- | --- | --- |
| `useConsistentMemberAccessibility` | `error`, `"explicit"` | every method reads `public` or `private`; in an OOP codebase the public surface of a class *is* its contract |
| `useImportType` | `error` | pairs with `verbatimModuleSyntax` so a type-only import emits nothing |
| `noProcessEnv` | `error` | config is read once per app, in `env.ts` |
| `noRestrictedImports` | `error` | the server-only boundary — see [boundary](reference/boundary.md) |
| `noExplicitAny` | `error` | promoted from a warning |
| `noStaticOnlyClass` | **`off`** | the intended pattern here, not a smell |

### `useImportType` is the load-bearing one

With [`verbatimModuleSyntax`](../../tsconfig/docs/reference/base.md): the flag makes a type-only import
emit nothing, this rule makes it *written* type-only — so "`ui` may reference `PermissionKey` without
depending on `permissions`" is build-enforced.

### `noStaticOnlyClass` is off on purpose

It would flag `Uuid`, `Identifiers`, `ProcedurePermissions`, `PermissionRegistry`, `StorageKey`,
`ApiKeyHasher`, `QueueName` — deliberate static namespaces with a `private constructor()`. The
alternative is suppressions everywhere or the free functions the ESLint OOP selectors forbid.

### `noProcessEnv` needs a companion

```json
"noRestrictedImports": { "options": { "paths": {
  "node:process": "Config is read once in apps/*/src/env.ts and passed down."
} } }
```

The rule catches `process.env.FOO` but **not** `import { env } from "node:process"`, so both are needed.
The two `env.ts` files are exempted by an override ([boundary](reference/boundary.md)).

---

## What Biome deliberately does not own

Four things stay with ESLint, by design:

- **`parameter-properties`** — Biome's `noParameterProperties` *bans* the form; nothing requires it.
- **The typed promise rules** — Biome's `noFloatingPromises`/`noMisusedPromises` (nursery, off) miss
  **`abstract` class members** on 2.5.7, which is every port here.
- **The OOP shape selectors** — AST assertions with no Biome equivalent.
- **Bans needing named-export or type-import nuance** — Biome's `noRestrictedImports` flags
  `import type` like a value import and cannot target named exports.

**Biome owns "this whole module, no exceptions"; ESLint owns nuance**
([rules](../../eslint-config/docs/reference/rules.md)).

---

## See also

- [The server-only boundary](reference/boundary.md) — every `overrides` block and the two failure modes
- [`@loadbearing/eslint-config`](../../eslint-config/docs/index.md) — the other half
