---
title: Classes and methods
description: Role nouns for seams, technology prefixes for implementations, the method vocabulary, and the assert/can split.
---

# Classes and methods

- **A seam is a plain role noun — no `I`, no `Abstract`:** `VectorStore`, `Clock`. Its
  implementation is technology + seam: `PgVectorStore`, `SystemClock`.
- **Banned suffixes:** `Manager`, `Helper`, `Util`, `Handler`, bare `Service`. A class that fits no
  role noun in `docs/opinions/classes.md` wants splitting.
- **Use-case entry is `execute(principal, input)`.** Repository reads are `findBy<X>` (nullable) and
  `findBy<X>OrFail` (throws); writes are `save` and `delete`, never `update`/`insert`.
- **`can()` answers, `assert()` enforces.** Mixing them is how a UI check becomes the only check.
- **Explicit accessibility on every member.**
- **No exported free functions in the OOP packages** — a class with a private constructor and
  static methods instead. Applies to **exported** symbols in **`src/`** only; `ui`, `query`,
  `feature` (React) and `apps/*` are exempt.
- **No static mutable state.** `static readonly` holding a `Map` is still mutable; build derived
  lookups once at module load and freeze them.

Argument: [`docs/opinions/classes.md`](../../opinions/classes.md).
