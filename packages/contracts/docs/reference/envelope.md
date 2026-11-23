---
title: Envelope and Pagination
description: One list shape for the whole product, and why the pagination cap lives in the schema.
---

# `Envelope` and `Pagination`

```ts
export class Envelope {
  public static paginated<T extends z.ZodType>(item: T): z.ZodObject<{
    items: z.ZodArray<T>;
    total: z.ZodNumber;
    limit: z.ZodNumber;
    offset: z.ZodNumber;
  }>;

  public static readonly acknowledged: z.ZodObject<{ ok: z.ZodLiteral<true> }>;
}

export class Pagination {
  public static readonly query: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
  }>;
}
```

---

## Decide the list shape once

Every list procedure returns `{ items, total, limit, offset }` — *one* shape beats the best shape: one
`useList` and invalidation rule in `query`, one empty state, counter and pager in `ui`, one protocol for
REST partners. Left to features you get `{ data, meta }`, `{ results, nextCursor }` and bare arrays, and
special cases forever. (Keyset lists carry their cursor in page data instead.)

## `max(100)` is a denial-of-service guard in a schema

```ts
limit: z.number().int().positive().max(100).default(25),
```

In the schema, the cap binds every contract consumer — the worker, a desktop offline queue, a future
NestJS implementation — not one remembered route. `.default(25)` bounds a caller omitting both fields.

## `paginated` is a function, not a schema

It wraps the item schema, declaring `total`/`limit`/`offset` once with the item type flowing through;
per-resource envelopes drift at the first `hasMore`. `T extends z.ZodType` is Zod 4's base type;
`z.ZodTypeAny` is the deprecated Zod 3 spelling that still resolves.

## `acknowledged` is a closed literal

```ts
z.object({ ok: z.literal(true) })
```

`z.literal(true)`, not `z.boolean()`: success or a throw, never an `{ ok: false }` a caller can forget —
failure is an `AppError` with a code ([errors](../../../errors/docs/index.md)).
