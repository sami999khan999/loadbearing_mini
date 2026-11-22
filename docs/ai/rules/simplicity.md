---
title: Simplicity — the tie-breaker
description: The tie-breaker when two designs satisfy every other rule: the least structure that achieves the goal.
---

# Simplicity — the tie-breaker

> **Build the least structure that achieves the goal. Performance is part of the goal.**

Structure removed at the cost of a slower system has not been simplified; the cost has moved.

**Ceremony** is structure a pattern demanded (a folder per file, an interface with one
implementation and no second in prospect). **Terseness** is removing what a reader needed. The test
is **how much someone must hold in their head to change this safely**, not line or file count.

A directory earns its place by holding more than one file or being a path a tool requires; a package
by a dependency boundary a folder cannot express; an abstraction by a second implementation —
**except a seam whose swap is certain and whose retrofit would be spread, not local.** If the
future swap touches one adapter, just write the adapter.

**Before adding structure:** What breaks without it? Is adding it later spread or local? Does the
simpler version cost throughput, latency or a query?

**Deleting structure is a change** and gets the same verification.

Argument: [`docs/opinions/simplicity.md`](../../opinions/simplicity.md).
