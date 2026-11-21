---
title: Back-ports
description: Features that exist in lite but not in the big kit, and why each must be added to the big kit to keep the two kits one design.
---

# Back-ports: lite into the big kit

These were built in lite first and must also land in the big kit, or the kits stop being one design
and every later port works around the difference.

| Lite feature | What it adds | Status in the big kit |
|---|---|---|
| **Gemini embeddings, search without an AI key, embedding model per chunk** | `GeminiEmbeddingProvider` behind `EmbeddingProvider` (chosen by `EMBEDDING_PROVIDER`); `EMBEDDING_PROVIDER=none` falls back to Postgres full-text via `VectorStore.searchText`; chunks record `embedding_model`, so switching provider re-indexes instead of mixing vectors | added 2026-10-14, big kit `fca97ff2..1a8f3754` on `dev` as `AI.0`, migration `0055_chunk_embedding_model`, plus `pnpm ai:reindex --adopt` for its existing OpenAI corpora |
| **Owner-only docs** | a fourth doc space audience, `owner`, readable only by its author; built in lite `LT3`, migration `0001_doc_owner_audience` | added 2026-10-03, big kit `cdb88c15..3f5bcf1b` on `dev` as migration `0052_doc_owner_audience`; its backlog §17 holds the hand checks |
| **Tailwind, Base UI and `cn`** | the UI stack: Tailwind v4 utilities in each component, the twelve colours as its only palette, Base UI for behaviour, `ThemeScope` for portals; `check-architecture` §32; built in lite `UI1`–`UI4` | added 2026-10-01, big kit `cf6b331f..035bab66` on `dev`, with lite's CI fixes; its backlog §16 holds the hand checks |
| **Doc access links and reader additions** | a doc space or page linked to a module, permission, flag or plan (`DocFeaturePolicy`, migration `0003_doc_access`), hidden as `NOT_FOUND`; whole-docs search grouped by space; breadcrumbs, pager and collapsible sections; tabs, steps, accordions and card icons (renderer 3, `pnpm doc:rerender`); the repository link and Open in ChatGPT / Claude. Also the UI fixes found on the way: Prose's memoised HTML, greys with hue `none`, and sprite symbols keeping their paint. Built in lite `DS0`–`DS6` | added 2026-10-03, big kit `cdb88c15..3f5bcf1b` on `dev` as migration `0053_doc_access`; its backlog §17 holds the hand checks |
| **Large docs spaces and the reader's delivery** | one web process per core (`cluster.mjs`); a trimmed nav, the `docSpace.nav` endpoint and a cached space list; one React in the SSR build; reader links as plain anchors; a page's HTML sent once; the doc readers' query plans pinned in specs | added 2026-10-03, big kit `cdb88c15..3f5bcf1b` on `dev`; its backlog §17 holds the hand checks |
| **glass-scroll scrollbars** | `PageScrollbar`, a glass overlay for the page, and the themed thin bar for every inner scroller, coloured only from the twelve | added 2026-10-03, big kit `cdb88c15..3f5bcf1b` on `dev` |
| **The platform organization run like any other** | `platform_admin` holds the whole catalog; Change role, the outrank and last-admin guards, `platformOnly` grants, revoke needs the key, no plan on the platform organization, `platform.doc.grant` to open a space, and the platform menu | added 2026-10-03, big kit `cdb88c15..3f5bcf1b` on `dev`, with all eight platform pages in `PLATFORM_ROUTE_PERMISSION` |
| **Private spaces: the three fixes after `owner`** | `FC.11`, an `owner` space read only inside the platform organization; `BL.15`, a departed author's space listed by slug for a manager to delete; `BL.16`, a private address ending in six random characters | added 2026-11-14, big kit `d2f25c6a..32bcdbad` on `dev`, as its `DONE.md` §17 `LP.4`–`LP.6`; they had no row here, which is how they were missed for a month |

## How to back-port

[Porting](porting.md) in reverse, with two differences: **the big kit has its full migration
history**, so write a new migration on its chain rather than regenerating a baseline; and **open an
entry in its backlog** naming the lite commit it came from. Update the status column when a back-port
lands and add a row whenever lite gains something — **a lite-only feature with no row here is how the
kits drift apart.**
