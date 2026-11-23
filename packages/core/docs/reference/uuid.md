---
title: Uuid
description: UUIDv7 generation and validation — why time-ordered keys beat random ones, what they leak, and why crypto is not a global this package can see.
---

# `Uuid`

```ts
Uuid.v7();               // "0194a5c3-8f21-7b4e-9a02-3c8d1f6e0a7b"
Uuid.isValid(someInput); // boolean
```

A static-only class with a `private constructor()` (Biome's `noStaticOnlyClass` is
[off for this](../../../../tooling/biome-config/docs/index.md)).

---

## Why v7 rather than v4

Every primary key is a UUID, so this compounds across every table. A **v4** is random: inserts scatter
across the index, the B-tree fragments, and the whole index must stay warm. A **v7** puts a 48-bit
millisecond timestamp in the high bits: inserts append, pages fill in order, rows created together sit
together, and `created_at`-ordered scans need no second index — measurable at hundreds of thousands of
rows, decisive at millions.

> [!WARNING]
> **v7 ids leak creation time** to the millisecond. Fine internally; where a customer-visible URL makes
> order or volume sensitive, add a separate opaque public id rather than reverting to v4.

---

## The layout

```
0194a5c3-8f21-7b4e-9a02-3c8d1f6e0a7b
└─────┬─────┘ └┬┘  └┬┘ └──────┬─────┘
      │        │    │         └─ 74 bits random (the rest)
      │        │    └─────────── variant: top 2 bits forced to 0b10
      │        └──────────────── version: high nibble forced to 0x7
      └───────────────────────── 48-bit millisecond timestamp, big-endian
```

| Bytes | Hex positions | Contents |
| --- | --- | --- |
| 0–5 | groups 1 and 2 | `Date.now()`, big-endian |
| 6 | group 3, first nibble | version `7`, then 12 random bits |
| 8 | group 4, first nibble | variant `0b10xx`, then random |
| rest | — | random |

```ts
const ts = BigInt(Date.now());
const bytes = Uuid.webCrypto().getRandomValues(new Uint8Array(16));
for (let i = 0; i < 6; i++) {
  bytes[i] = Number((ts >> BigInt(40 - i * 8)) & 0xffn);
}
bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
```

Sixteen random bytes, the first six overwritten with the timestamp, two nibbles forced. This
`Date.now()` is the **only** sanctioned system-clock read in `packages/` ([clock](clock.md)) — building
an id, deciding nothing. The `?? 0` never fires; it satisfies `noUncheckedIndexedAccess` without a
non-null assertion (which Biome flags).

---

## Why `crypto` is not a global here

> [!CAUTION]
> A bare `crypto.getRandomValues(...)` compiles **by invisible accident**.

TypeScript declares `crypto` only in `lib.dom.d.ts` and `lib.webworker.d.ts`;
[`library.json`](../../../../tooling/tsconfig/docs/reference/presets.md)'s `lib: ["ES2024"]` loads
neither. It typechecked because `tests/primitive/*.spec.ts` import `vitest`, whose types pull in vite's,
which carry `/// <reference types="node" />` — dropping `@types/node`'s globals into `core`'s program
(`tsconfig.json` includes `tests/**`). Without the specs: `TS2304: Cannot find name 'crypto'` (verified
both ways). The fix names the one method used and reads it off `globalThis`:

```ts
type WebCrypto = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

private static webCrypto(): WebCrypto {
  return (globalThis as unknown as { crypto: WebCrypto }).crypto;
}
```

Rejected alternatives:

| Alternative | Why not |
| --- | --- |
| add `@types/node` to `core` | `core` is the one package that must typecheck as isomorphic; this would also make `process` and `Buffer` resolve here |
| add `"DOM"` to `lib` | brings back `window`, which [`ServerOnly`](server-only.md) depends on *not* being declared |
| an ambient `declare const crypto` in `src/*.d.ts` | collides with `@types/node`'s own declaration wherever both land in one program |

`WebCrypto` is unexported, so `dist/index.d.ts` shows only `private static webCrypto;`. At runtime
nothing changes: Web Crypto is global in Node 19+, every browser and the Tauri webview — a type-level
problem only.

---

## `isValid` checks the version *and* the variant, and asserts neither is v7

```ts
/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
```

`[1-8]` is the version (every RFC 9562 version), `[89ab]` the variant:

- `…-7000-0000-000000000000` is **rejected** — the variant nibble is `0`.
- The nil UUID and the max UUID are **rejected** — neither carries a defined version.
- A well-formed **v4** is **accepted**, deliberately.

The version group was once `[0-9a-f]` — unchecked, so versions `0` and `f` passed; fixing that did not
make it a v7 assertion. `isValid` is a cheap edge guard: ids minted elsewhere (a client, an import, an
older row) are still ids, and rejecting them would put a schema decision in a regex. For "specifically
v7", check `value[14] === "7"` at the call site.

---

## Tests

`tests/primitive/uuid.spec.ts` pins the clock with `vi.setSystemTime` and asserts the leading 48 bits
round-trip — the claim the B-tree argument rests on:

```ts
const at = new Date("2026-01-01T00:00:00.000Z");
vi.useFakeTimers();
vi.setSystemTime(at);

const value = Uuid.v7();
const leading = value.slice(0, 8) + value.slice(9, 13);

expect(leading).toBe(at.getTime().toString(16).padStart(12, "0"));
```

---

## See also

- [`@loadbearing/core`](../index.md)
- [Clock](clock.md) · [Result](result.md) · [ServerOnly](server-only.md)
