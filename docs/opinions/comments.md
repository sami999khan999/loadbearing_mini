---
title: Comments
description: Line comments only, two lines maximum, and the argument for a design lives in docs/reference instead.
---

# Comments

## Every comment is `//`. There is no second form

No `/* */`, `/** */` or JSX `{/* */}` in any `src/` or `tests/` under `packages/*` or `apps/*` — not
above a class, not as a separator, not for commented-out code.

```ts
// packages/errors/src/error/app.error.ts
// The one failure shape, thrown on the server and rebuilt on the client. It carries
// no message — every word lives in `content`, keyed by code.
export abstract class AppError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    public readonly context: ErrorContext = {},
    public readonly fields?: readonly FieldViolation[],
  ) {
    // The code *is* the message. Nothing else is ever assigned here.
    super(code);
    this.name = new.target.name;
  }
}
```

**One form means no decision** to argue in review. **The cost, accepted deliberately:** JSDoc reaches
editor hover, `.d.ts` and API-docs tools; `//` reaches none. A consumer should learn what `AppError`
is for from `docs/reference/app-error.md`, which holds a worked example and is reviewed like prose; a
tooltip cannot and quietly rots.

## Two lines is the ceiling

A comment stops the *next* reader misreading the line under it. Longer is documentation in the
wrong file.

```ts
// `Object.hasOwn`, not `in` — `in` walks the prototype chain and admits `toString`.
public static isKnownCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CATALOG, value);
}
```

Long-form reasoning — why `CapabilitySet.intersect()` unions denies and intersects grants, why
`CLIENT_CATALOG` needs string-literal `import()` specifiers, why `InternalError.cause` is
non-enumerable — lives in the package's `docs/reference/`. **Say the constraint in code; let the
reference page carry the argument**, and point at it where a reader will want it:

```ts
// Narrow to the intersection with another set. Denies union, grants intersect, goal
// keys union — see docs/reference/capability-set.md for why each is load-bearing.
public intersect(other: CapabilitySet): CapabilitySet {
```

## The JSX form is `{ // }`

A comment between JSX children must be in an expression position:

```tsx
{
  // `role="alert"` so the message is announced when it appears, not only when the
  // input is next focused.
}
<p className="ui-field__error" role="alert">{error}</p>
```

The empty container renders nothing; the ceiling applies inside it. Hoist the comment above the
`return` or onto the line building the value where you can.

## Commented-out code is not a comment

```ts
export const ERROR_CATALOG = {
  ...coreErrors,
  // ...billingErrors,
} as const;
```

becomes a sentence:

```ts
// Merged from team-owned fragments. Add them here — `...billingErrors`.
export const ERROR_CATALOG = {
  ...coreErrors,
} as const;
```

Git keeps the deleted version; a reader cannot tell a placeholder from a 2am regression.

## Cutting an existing comment down

The six rules every package's sweep used, and what review applies to an overgrown comment:

1. **Keep it only if the next reader would otherwise misread the line beneath.** *What breaks if you
   change this line* is a constraint; *why the decision was made* is an argument.
2. **Cut outright:** history ("`pending` stood here and was removed"), war stories ("ran green for
   months"), doc-number cross-references, restated `docs/ai/rules/` rules, pre-emptive scope defences,
   cross-package analogies, and any paragraph appearing in more than one file.
3. **An argument worth keeping moves to `packages/<name>/docs/reference/<subject>.md`**, registered
   in `reference/meta.json` and named from the parent `index.md`; the code keeps
   `// see docs/reference/x.md`.
4. **An `import.ts` header is one line plus its `// ── @scope/pkg ──` separators.**
5. **A JSX block becomes `{ // }`** or is deleted.
6. **CSS under `packages/ui/src/style/**` keeps `/* */`** (CSS has no `//`), with the same ceiling.

> [!NOTE]
> An argument with no reference page to move to is a reference page that needs writing — the
> expensive half of the rule, and why it is worth doing once.

## Separators are `//` too

```ts
// packages/core/src/import.ts
// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { ServerOnlyError } from "@loadbearing/errors";
```

**The one place `/* */` survives** is a documentation sample eliding code mid-line, since `//`
cannot close — `const BY_MODULE: ReadonlyMap<string, readonly PermissionKey[]> = /* grouped once */;`
— a prose device in a Markdown fence. No file under `src/` or `tests/` has one.

## What this is not, and how it is enforced

**Not a rule against comments.** One saying why the obvious approach is wrong earns its place —
without this, the next person "simplifies" `server-only.ts` into a compile error:

```ts
// `globalThis.window`, not bare `window` — no DOM lib, so the identifier is TS2304.
if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
```

**No linter expresses either half**, so both are `check-architecture.mjs` assertions over
`{src,tests}` under **`packages/*` and `apps/*`**:

| | |
|---|---|
| **§5** | any line whose trimmed form opens with `/*` or `{/*` fails the build |
| **§14** | three or more consecutive `//` lines fail the build |

§14 exempts lines carrying no prose — a `// ──` separator, a `// biome-ignore`, `// eslint-disable`
or `// @ts-` pragma — each of which **ends** a run. That holds only where a sentence ends: a separator
under a line not ending in `.`, `?`, `!` or `:` is a ruler through one comment and fails. `*.gen.ts`
is skipped (`route-tree.gen.ts` asks to be). Anchoring to the start of a trimmed line keeps the grep
safe — Biome always puts a block comment on its own line, so `"**/dist/**"` in a string never
matches — and no inline comment can silence either assertion.

**`pnpm check:comments` reports and never fails:** per-package density, block count, and the
twenty-five files with the most comment lines, so drift shows before a file trips §14.
