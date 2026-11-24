---
title: Comments
description: Line comments only, two lines maximum, and where the reasoning goes instead.
---

# Comments

- **Every comment is `//`.** No `/* */`, no JSDoc, no JSX `{/* */}`, anywhere. Between two JSX
  children: `{`, the `//` lines, then `}`. A build failure (§5) no inline comment can silence.
- **Two lines maximum (§14).** Three consecutive `//` lines fail. A `// ──` separator or a
  `biome-ignore` / `eslint-disable` / `@ts-` pragma ends a run, but a separator under a line that
  does not end a sentence fails. `*.gen.ts` is skipped. Both cover `{src,tests}` in `packages/*`
  and `apps/*`.
- **A comment exists to stop the next reader misreading the line under it.** Longer reasoning goes
  in `packages/<name>/docs/reference/` (registered in `reference/meta.json`, named from the parent
  `index.md`); the code says the constraint and `// see docs/reference/x.md`.
- **Cutting one down:** drop history, war stories, doc cross-references, restated rules, scope
  defences, and anything said in a second file. Keep the failure the line prevents.
- **No commented-out code.** Git has it; write the sentence instead.
- **Not a rule against comments** — one saying why the obvious approach is wrong earns its place.
- **`pnpm check comments`** reports density and block counts and never fails; §14 is the gate.

Argument: [`docs/opinions/comments.md`](../../opinions/comments.md).
