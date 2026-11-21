---
title: Scaling up
description: What the lite kit cannot do at larger scale, and how each limit is fixed by bringing back a piece of the big kit — written to be read without access to the big kit's repository history.
---

# Scaling up

**loadbearing lite** was cut from **loadbearing** ("the big kit"), a separate repository. This folder
is the bridge: every limit lite has, and the big-kit piece that fixes it.

| | |
|---|---|
| Big kit repository | <https://github.com/prodicle/loadbearing_tanstack_start_kit> |
| Cut from commit | `3fafa78c2f42d2d718236d7666429b858199118a` (2026-09-30) |
| Record of the cut | [`UPSTREAM.md`](../../UPSTREAM.md) |

> [!IMPORTANT]
> **Always port from the commit above, not the big kit's latest `main`** — lite is that commit with
> pieces removed, and a later commit adds everything changed since to the port. See [Porting](porting.md).

## How the two kits relate

**Lite removes stores, never seams** — same code shape, fewer services running:

- **Same packages, scope, file and class names** — a copied big-kit file needs no import changes.
- **Same database shape** — `organization_id` everywhere, tenant partitioning, every repository
  `catalog`, `local` or `routed`, all on one database.
- **Same env names** — `REDIS_CACHE_URL`, `REDIS_QUEUE_URL`, `REDIS_REALTIME_URL` point at one Redis;
  `DATABASE_URL` and `DATABASE_DIRECT_URL` at one Postgres.

So most fixes below are **config** or **copy files back**, never a rewrite.

## Paths in this folder

Paths in this repository are plain (`docs/ai/rules/data.md`); paths in the big kit at the commit
above carry `upstream:` (`upstream:packages/infrastructure/src/clickhouse/`) — open them there.

## The limits, and what fixes each one

Thresholds are the big kit's planning estimates
([`docs/opinions/data-and-scale.md`](../opinions/data-and-scale.md) §3), not measurements.

| Lite limit | When it starts to hurt | Fix | Kind of work | Page |
|---|---|---|---|---|
| **One Redis does two jobs** — cache and job queue share memory | The cache grows large enough to crowd the queue | Run a second Redis | Config only | [Split Redis](split-redis.md) |
| **Too many database connections** | Past ~100 connections | Put pgBouncer in front of Postgres | Config only | [pgBouncer](pgbouncer.md) |
| **Reads compete with writes** on the one database | Dashboards slow down writes | Add a read replica | Config, maybe one panel | [Read replica](read-replica.md) |
| **Heavy reports slow the main database** | Around 250M rows a year, or when reports take seconds | Bring back ClickHouse analytics | Copy files back | [Analytics](analytics.md) |
| **Old data is never archived** — tables grow forever | When database storage costs real money | Bring back retention and cold storage | Copy files back | [Retention](retention.md) |
| **Logs only go to the screen** | Running more than one server | Bring back Loki and Alloy | Config plus a small copy | [Logs](logs.md) |
| **One database machine** holds everything | Around 1B rows a year, or writes past what one machine takes | Add database nodes and move organizations onto them | Copy files back, then operate | [Shard nodes](shard-nodes.md) |

Product features left out come back the same way: [Widgets and zones](widgets.md), and the big
kit's post-cut platform **Workers** page, [Worker control](worker-control.md).
[Messaging](messaging.md) came back on 2026-11-12.

**Order:** config-only moves first (cheap, reversible), then replica and analytics, shard nodes last —
the only move needing someone to operate several databases.

## What the big kit does not fix

1. **Free-tier hosting limits** (Vercel Hobby is non-commercial; Neon, mail and embedding tiers have
   quotas) — fixed by paying, not code.
2. **A single server going down** — worker and realtime on one VM is a single point of failure in
   either kit; running two or a managed host is a deployment decision.
3. **Moves the big kit has not built either** — see [Beyond the big kit](beyond-the-big-kit.md).
4. **Features only lite has.** They flow the other way, from lite into the big kit — see
   [Back-ports](back-ports.md).

## See also

- [Porting](porting.md) — the general procedure every page here follows.
- [`docs/ai/rules/data.md`](../ai/rules/data.md) — the rules that keep these fixes config-only.
- [`docs/opinions/data-and-scale.md`](../opinions/data-and-scale.md) — the big kit's full argument
  for which store owns what, and the order scaling moves happen in.
