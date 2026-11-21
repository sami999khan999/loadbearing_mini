---
title: Simplicity
description: The least structure that achieves the goal — and performance is part of the goal, not the thing traded away to reach it.
---

# Simplicity

The other pages decide *what* a thing is called and *where* it lives. This one decides **how much
structure** to build, and breaks ties when two designs satisfy every other rule.

> **Build the least structure that achieves the goal. Performance is part of the goal.**

Structure removed at the cost of a slower system has not been simplified — the cost has moved
somewhere nobody is looking.

---

## Ceremony is not simplicity, and neither is terseness

**Ceremony** is structure a pattern demanded: a folder per file, an interface with one
implementation and no second in prospect, a config layer nothing configures. **Terseness** is
removing what a reader needed: a clever one-liner, a name that saves eight characters, three
concerns fused because they were adjacent.

> **The test: how much does someone need to hold in their head to change this safely?**

A barrel naming twenty exports is more typing than `export *` and less to hold, because widening the
API shows up in review — so the longer file is the simpler one ([Imports and exports](imports.md)).

---

## What earns structure

| Structure | Earns it by |
|---|---|
| A directory | Holding more than one file, or being a path a tool requires |
| A package | Having its own dependency boundary that a folder cannot express |
| An abstraction | A second implementation existing, or being certain enough to design for |
| A config layer | Something actually varying between environments |
| A new label, tier, or catalog entry | A question somebody asks that nothing else answers |

**`infra/` failed this test.** Six config files lived in eleven directories, four of them empty
path segments, because compose mounted a directory where it could mount a file:

```
infra/postgres/init/01-extensions.sql        →  infra/postgres.init.sql
infra/loki/config/loki.config.yml            →  infra/loki.config.yml
```

Flattened, the names carry what the folders did — `<subject>.<role>.<ext>`, as in [Files](files.md).
Its six documentation files for six config files became one `README.md`.

---

## Performance is a requirement, not a trade

*"We simplified it, it is a bit slower"* usually means a cost moved from code that is read into a
system that is run. Prefer simple **and** fast; where they truly conflict, say so rather than let the
simpler one win by default. Usually they do not conflict:

- **Four queries instead of one join.** `CapabilityRepository.resolveFor()` avoids a wide left join
  whose cartesian product across role permissions, goal memberships and overrides needs
  deduplication in code. The fourth query — the org's entitlement — is itself four lookups (plan
  rows, unlimited marker, live adjustments, disabled modules) tagged and combined with `UNION ALL`:
  one round trip, no row multiplication.
- **A grep instead of a lint plugin.** `check-architecture.mjs` is zero-dependency Node. A custom
  ESLint plugin would be slower, need its own build, and be silenceable inline.
- **Two Redis instances instead of one.** One instance forces one eviction policy on two needs —
  `allkeys-lru` drops queued jobs, `noeviction` makes a full cache error. No correct single answer
  means two concerns in one container.
- **Four log labels.** Indexing `trace_id` is one stream per request: more configuration *and* the
  setup that falls over ([Data and scale](data-and-scale.md)).
- **Not normalising third-party log levels.** A per-vendor regex for Postgres, Redis, MinIO and
  ClickHouse breaks on their next release; `{app="postgres"} |= "ERROR"` keeps working.

---

## When an abstraction is worth it before the second implementation

**A seam earns its place early when the swap is certain and the retrofit is spread, not local.**
`ContentSource` has one implementation and is right, because adding a CMS later would touch every
screen. `VectorStore` likewise: a dedicated vector database is years away, and by then every call
site would change. An abstraction whose future swap touches one adapter has earned nothing; write
the adapter.

**The counter-example is `AnalyticsReader`:** two methods, two rollup tables, a ClickHouse
implementation and an `ANALYTICS_DRIVER` flag, and **nothing ever called it**. It failed the half
that is easy to skip — a reader nothing reads has no call sites, so the retrofit was concentrated in
one file. Certainty about the swap is the cheap half of the test and alone justifies anything. It
was deleted. Beside it, `AnalyticsProjector` is the seam done right: it writes, has a consumer and a
nightly reconciliation, and ships, while ClickHouse stays stopped and `CLICKHOUSE_URL` unset.

**"The seam is implemented" and "the store is started" are two decisions; only the second is
expensive to be wrong about.** An unused seam is not free either — two implementations kept in step
by hand against a shape no consumer has tested.

---

## Applying it

When adding anything structural:

1. **What breaks if I leave it out?** No answer — do not add it.
2. **Is adding it later spread or local?** Local — later.
3. **Does the simpler version cost throughput, latency or a query?** Then it is not simpler; say
   what it costs and choose deliberately.

**Deleting structure gets the same verification as adding it.** The `infra/` flattening — single-file
mounts, Postgres initialising, the four labels surviving — was checked against a running stack from
empty volumes; "it should still work" is how a simplification becomes an outage.

**Enforced by review, deliberately** — a linter can count files but not tell ceremony from necessity.
Review asks one question with a right answer: **name what breaks if this structure is removed.** If
nobody can, it goes.
