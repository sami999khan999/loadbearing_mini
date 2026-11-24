---
title: The platform slice
description: What a use-case above the tenant may assume, why its health seam is a slice port rather than a cross-cutting one, and the audit rebase that keeps a global change out of a customer's trail.
---

# `application/src/platform/`

Every other slice acts inside one tenant; this one acts above all of them.

## The actor is ordinary; the key is not

The `Principal` is ordinary — it carries whatever organization the session points at, often a customer
tenant. The key makes it platform work:

```ts
this.authorizer.assert(actor, "platform.status.read");
```

`platform.*` is `scope: "platform"`, so `can()` consults only the platform axis; a tenant `wildcard` never
reaches it (
[platform scope](../../../permissions/docs/reference/platform-scope.md)).

## The audit row is rebased, and it is a rule rather than a field

Recorded under the admin's active tenant, a global change would appear in a customer's trail. So
platform use-cases audit against the **tier**:

```ts
await this.activity.record(
  new Principal(await this.platform.organizationId(), actor.userId, actor.capabilities, actor.kind),
  "platform.policy.changed",
  { … },
);
```

That is decision D38, and it is deliberately not a field on `Principal`: authorization has already
happened against the real principal, and this is the audit call's actor alone. A `rebasedFor`
field would be one more thing every other use-case has to ignore correctly.

Every write in the slice does it — `ToggleReplicaReadsUseCase`, `DeleteOrganizationUseCase`,
`ExportOrganizationUseCase` and the account, plan and flag writes beside them.

## `PlatformReader` — which organization is the tier

```ts
abstract class PlatformReader {
  abstract organizationId(): Promise<OrganizationId>;
  abstract organization(): Promise<PlatformOrganization>;
}
```

`organizationId` is read on **every RBAC write** (`CapabilityCache` decides whether to flush the platform
axis); `organization` adds slug and name for the screen. Both throw on a miss — `organizations_platform_uq`
allows at most one and `seed:prod` makes one, so a miss is an unseeded, broken deployment.

## `PlatformHealthReader` — a slice port, not a cross-cutting one

The status page reports what `Container.health()` already answers. `Container` lives in
`composition`, which sits to the **right** of this package, so a use-case cannot name it. The seam
is forced by the layering rather than by an expected second implementation, which is the one
exception `simplicity.md` allows.

It is in the slice rather than in `application/src/port/` for the reason
[`folders.md`](../../../../docs/ai/rules/folders.md) gives: `port/` is for cross-cutting seams, and
the test is whether a second feature adds a *method* to it or a *file beside it*.
`PlatformPolicyRepository`, `TenantRepository` and `ShardMapReader` are files beside it, every one.

`PlatformHealth` narrows `HealthReport`: it drops `pool`, because a screen showing a pool gauge
would be showing one process's, which is not the deployment's. It keeps `analytics`, which is always
`null` in lite: no analytics store runs, so the status contract keeps the field and reports it
absent.

`replica()` is its second method, added by `25.1`: every node's standby folded into one reading,
or `null` when there is none. It is kept out of `report()` on purpose. A standby that falls behind
slows the batch reads and takes nothing down, so it must not turn `healthy` false.

## `ShardMapReader` — the directory as an operator reads it

A third slice port, beside the two above, and a **catalog** read. The directory is what says where
a tenant is, so it cannot be routed by one — see
[sharding](../../../infrastructure/docs/reference/sharding.md).

Lite keeps one method: `findByTerm(term)` takes an id **or** slug (for the entitlement and flag-target
use-cases), comparing `organizations.id::text = $1` (a slug cast to `uuid` is `22P02`); a miss is `null`,
not `NOT_FOUND`.

The big kit's shards screen adds a node listing and a tenant page per node, and moves tenants
between nodes. The way back is [`docs/scale/shard-nodes.md`](../../../../docs/scale/shard-nodes.md).

## `DeleteOrganizationUseCase` — the order is the behaviour

A delete is two halves. `DeleteOrganizationUseCase` is the request: it asserts
`platform.tenant.manage`, checks both refusals, audits, and queues a `tenant-delete` job on the
maintenance queue. `PurgeOrganizationUseCase` is the job, run placed on the tenant's node.

The job archives every month, drops the seven tenant partitions, deletes the outbox rows and doc
images, stamps the tombstone, deletes the row, then flushes. Each step is where it is because of
what the step before it makes impossible.

The archive cutoff is the first of **next** month, not now. The question is "what exists", because
the partitions are about to be dropped and a month left unarchived is rows nothing can hand back.

`dropTenantPartitions` runs **outside** the transaction and before it. Dropping a partition is a
catalog edit, and a transaction holding seven of them blocks every other DDL in the system for as
long as it is open.

`markTenantDeleted` runs before the row goes. The nightly sweep reads that tombstone and nothing
else, so a delete that skipped it would leave the objects in the bucket with nothing to end their
window.

The capability flush and the shard cache invalidation run **after** the commit. Flushed before it,
the cache would refill from rows the transaction had not removed yet — which is the stale entry the
flush exists to prevent.

**Two refusals:** the tier (deleting it locks every admin out) and a typed slug checked server-side too.

What it does **not** do is delete the cold objects. Those stay thirty days, until the nightly
`retention` job sweeps them; see
[cold storage](../../../infrastructure/docs/reference/cold-storage.md).

## `ExportOrganizationUseCase` — queued, and the day is the request's

An export is a full read of seven tables plus the catalog, streamed to S3. It is a job, and the
shape is the delete request's: validate, audit, enqueue, hand back the job id.

The day comes from the clock **once**, in the use-case, and travels in the payload. A retry the
next morning then writes the objects the job id already claimed rather than a second day's set.
The id is dotted — `tenant-export.<organization>.<day>` — because BullMQ rejects a colon.

`ListTenantExportsUseCase` reads the bucket, not a table (nothing to disagree), with fifteen-minute
presigned URLs and `staleTime: 0`.

What the export **does not** carry is the hashes. `invitations.token_hash` and
`api_keys.token_hash` are nulled on the way out: a hash is a credential, not data the customer
owns, and handing one back is handing back the ability to brute-force the key it was made from.

## The bucket rule is composed in one place

`RetentionRules.lifecycleFor()` composes lite's one rule — `export/` expires after seven days (a download,
not a liability); the nightly `retention` job writes only when `lifecycleMatches` finds a difference.

The big kit composes a rule per table from its retention policies. The way back is
[`docs/scale/retention.md`](../../../../docs/scale/retention.md).

## The replica switch sits on the status page, beside the lag it governs

`platform_policy` is one row, and `check (id = 1)` is what makes that a database guarantee rather
than a convention — the repository reads it without an `order by`. The migration deliberately does
**not** insert it: an absent row is the defaults, and the first save is what creates it.

`platform_policy.replica_reads_enabled`, written by `ToggleReplicaReadsUseCase`
(`platform.replica.manage`), routes nothing in lite (the big kit's analytics consumer read it —
[`read-replica.md`](../../../../docs/scale/read-replica.md)); lite's public doc reads ask for a standby per
call.

**It lives on `/platform/status`.** The status DTO carries
`replica: { healthy, lagSeconds, readsEnabled } | null`. The operator deciding whether reads go
through a standby is looking at how far behind that standby is, on the same screen. And the
switch then needs only `platform.status.read` to render.

**`null` is "this deployment runs no standby", and the switch refuses it** with
`ConflictError("replica", "not_configured")`. Saving it would leave a setting already on the day a
standby is added, and nobody would have decided that. The panel renders nothing at all, since the
table already says "Not configured".

**On is safe by construction.** It does not trade correctness for load: a read uses the replica
only once it has replayed everything the primary had when the read began. So the switch is a
capacity decision, and the default of off is the deploy before the switch existed.

Every use-case in the slice asserts a `platform.*` key, and every write rebases its audit row.
