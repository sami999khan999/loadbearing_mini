---
title: Keyset pagination
description: Why the newer lists page by cursor rather than offset, why the page carries no total, and what the cursor actually encodes.
---

# Keyset pagination

`Pagination` (`limit`/`offset`) serves tenant-bounded lists — roles, members, invitations — where
`OFFSET` costs nothing.

`Keyset` is for the ones that grow with activity, which in lite is notifications. **`OFFSET
40000` reads forty thousand rows to discard them**, across monthly partitions — every page before it.

## The page has no `total`, and that is the point

An exact `count(*)` reads the rows `OFFSET` would. The envelope is `{ items, nextCursor }`; **null means
the last page** — a full page can be last, so `items.length < limit` would cost an extra fetch. These are
infinite lists; nothing shows "page 7 of 412".

## The query is `{ limit, cursor }`

`limit` caps at 100, default 50, in the schema so every caller inherits it. `cursor` is absent on the
first page and **opaque** — the client echoes `nextCursor`, so the encoding can change without a version;
capped at 256 characters.

## What the cursor encodes

`KeysetCursor` in `packages/infrastructure/src/pg/primitive/keyset-cursor.ts` is base64url over
`<iso>|<uuid>`: the sort column and the tie-break, and nothing else.

**Both halves matter:** the id breaks `created_at` ties, and milliseconds are kept, since truncation
makes page boundaries repeat or skip rows. The query:

```sql
WHERE organization_id = $1 AND (created_at, id) < ($2, $3)
ORDER BY created_at DESC, id DESC
LIMIT $4 + 1
```

The row-constructor comparison uses the composite index; the equivalent `OR` form plans worse. `+ 1`
detects another page without counting. **A malformed cursor is a `ValidationError`**, never a silent first
page that would loop forever.
