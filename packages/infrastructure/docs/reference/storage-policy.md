---
title: The bucket's lifecycle policy
description: Why a second gateway rather than a method on StorageGateway, why "no configuration" is an error code rather than an empty list, and why the app owns the whole configuration rather than one rule of it.
---

# `S3StoragePolicyGateway`

`StorageGateway` moves objects. This moves the **bucket's own policy**: the lifecycle rules that say
how long an object lives in S3 before the bucket deletes it. Lite writes one rule: objects under
`export/` expire after seven days.

## Why it is a second port

`StorageGateway` excludes bucket, region and endpoint as adapter configuration — and a lifecycle rule is
exactly that, about no object. So the seam follows the subject, not the vendor: two gateways over one S3
client and one `S3Config`.

## The application owns the configuration, not a rule of it

`PutBucketLifecycleConfiguration` **replaces every rule** — S3 has no per-rule write or merge. So:

- `RetentionRules.lifecycleFor()` composes the **whole** configuration. In lite that is the one
  `export/` rule; the big kit adds a rule per retained table here.
- Rules are **sorted by prefix**, so identical runs compare equal and the daily job does not rewrite.
- An empty list **deletes** the configuration, with `DeleteBucketLifecycle` rather than a `Put` of
  zero rules — S3 and MinIO both answer `InvalidArgument` to that. Lite never sends one, since it
  always composes the `export/` rule.

## The `export/` rule

A flat seven days, present before any export (rules must precede objects); the first run applies it,
later runs nothing. Flat, not per tenant: **a bucket holds at most a thousand rules**.

`cold/` has no rule. A deleted tenant's archive is removed by the nightly sweep after thirty days —
see [Cold storage](cold-storage.md).

## "No configuration" is an error, and treating it as one would never converge

A never-configured bucket answers **`NoSuchLifecycleConfiguration`**, not `[]` — propagated, the daily
reconcile would fail and report drift forever on every fresh bucket. `lifecycle()` maps that code
(read off `name` or `Code`, as the SDK varies) to `[]`; **MinIO answers the same**, so compose tests it
for real.

## A rule the app did not write is reported as absent

`lifecycle()` drops any rule with no prefix filter, and any whose expiry is a *date* rather than a
span of days. Both are legal S3 and neither is anything this system writes. A transition is
ignored: lite writes and compares none.

So the next `applyLifecycle` removes them — a rule `RetentionRules` did not compose is drift; a
hand-written one belongs there or in another bucket.

## What is not here

**Per-table retention and a colder storage class.** The big kit composes a `cold/<table>/` rule per
retention row, with an optional transition to a cheaper class. Both left with calendar retention;
bringing them back is [Retention](../../../../docs/scale/retention.md).

**Per-tenant expiry.** Lifecycle rules match a prefix and are capped at 1,000 per bucket, so a rule
per tenant is not available at any tenant count worth having.
