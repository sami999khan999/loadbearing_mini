# Upstream

This kit, **loadbearing lite**, was cut from the big kit, **loadbearing**, and lives in its own git
repository. This file records exactly where it came from, so anything removed can be brought back
from the right place.

| | |
|---|---|
| Big kit repository | <https://github.com/prodicle/loadbearing_tanstack_start_kit> |
| Cut from commit | `3fafa78c2f42d2d718236d7666429b858199118a` |
| Commit date | 2026-09-30 |
| How it was cut | [`docs/plans/LITE-KIT-PLAN.md`](docs/plans/LITE-KIT-PLAN.md) |
| How to bring things back | [`docs/scale/`](docs/scale/index.md) |

## What was removed

| Removed | Why | Bring it back with |
|---|---|---|
| Second Redis instance | one Redis serves cache, queue and realtime | [Split Redis](docs/scale/split-redis.md) |
| pgBouncer | direct connection; code already pooler-safe | [pgBouncer](docs/scale/pgbouncer.md) |
| Read replica | one database | [Read replica](docs/scale/read-replica.md) |
| ClickHouse analytics | no analytics store | [Analytics](docs/scale/analytics.md) |
| Retention, cold storage | partitions are kept, never archived | [Retention](docs/scale/retention.md) |
| Loki, Alloy | logs to stdout only | [Logs](docs/scale/logs.md) |
| Tenant moves, extra shard nodes | routing kept, running node 0 only | [Shard nodes](docs/scale/shard-nodes.md) |
| Widgets and zones | not selected; the dashboard is static | [Widgets and zones](docs/scale/widgets.md) |

## Ported back since the cut

| Date | What | From commit |
|---|---|---|
| 2026-10-10 | The shared fixes in `docs/plans/BACKLOG.md` §2 and §3: tooling, UI, web, realtime, index staging and doc storage | big kit `dev`, `a73274ed..ef48f12d` |
| 2026-10-10 | The four left open by the review, `docs/plans/BACKLOG.md` §4: editor leave guard, credential mail retention, export image links, enrolment lock-outs | big kit `dev`, `7ddc6f96..305447b7` |
| 2026-10-10 | The final check's shared fixes, `docs/plans/BACKLOG.md` §5 | big kit `dev`, `4f20464e..4da4c583`, `04bba7c4` |
| 2026-10-10 | Security headers, the web connection budget and the https `AUTH_URL` rule, `docs/plans/BACKLOG.md` §5 | big kit `dev`, `0a505ac7..3086f6c7` |
| 2026-11-11 | The AI Assistant, its org usage meter and the loader 404s, [`docs/plans/AI-CHAT-PLAN.md`](docs/plans/AI-CHAT-PLAN.md) | big kit `dev`, `96377dae..9fb0c6c7`, without the ClickHouse report |
| 2026-11-12 | Web push, `docs/plans/BACKLOG.md` §7, and the comment-pass escape fix | big kit `dev`, `664cc7e4..16ad5fb3`, `ef77091a` |
| 2026-11-12 | The assistant stream's resume-point fix, `docs/plans/BACKLOG.md` §7 `BL.20` | big kit `dev`, `94488b67` |
| 2026-11-12 | Five fixes from the big kit's browser walk, `docs/plans/BACKLOG.md` §8 | big kit `dev`, `67567aae..876fa6bd` |
| 2026-11-12 | `WK.3`, `WK.5`, `WK.6` and the `Select` placeholder, `docs/plans/BACKLOG.md` §8 | big kit `dev`, `718592db`, `0af8dd19`, `6edd4fec` |
| 2026-11-12 | `WK.7`, the sidebar shell, `docs/plans/BACKLOG.md` §8 | big kit `dev`, `48e1e311..54b269f8` |
| 2026-11-12 | Messaging, at the big kit's parity: threads, reactions, files, presence, typing, mentions and grouped notifications, `docs/plans/BACKLOG.md` §9. Not `26.4`: lite keeps every message month | big kit `dev`, as of `fe7382e8` |

## Added in lite, owed to the big kit

The UI stack, Tailwind and Base UI, was back-ported on 2026-10-01; see the table there.

See [`docs/scale/back-ports.md`](docs/scale/back-ports.md).
