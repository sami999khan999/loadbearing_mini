---
title: minio
description: The S3 stand-in, the one bucket and its three prefixes, and the one-shot container that creates it.
---

# `minio`

An S3-compatible store, so the S3 code path runs in development, not first on deploy day.

| | |
| --- | --- |
| **Image** | `coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` |
| **Inside the network** | `minio:9000` |
| **From the host** | `localhost:29000` (API), `localhost:29001` (console) |
| **Credentials** | `ratchet` / `ratchetsecret` |
| **Volume** | `miniodata` |
| **Bucket** | `ratchet` |

---

## Why MinIO rather than a filesystem adapter

The AWS SDK talks to MinIO unchanged; a filesystem `StorageGateway` would first run presign expiry,
addressing, multipart and error shapes in production. The one difference, addressing, is config:

```ini
S3_FORCE_PATH_STYLE=true    # MinIO: endpoint/bucket/key
S3_FORCE_PATH_STYLE=false   # AWS:   bucket.endpoint/key
```

It has been in `.env.example` from the start, so production differs by one line.

---

## One bucket, three uses

Everything the application stores goes into `ratchet`. The prefix says what an object is.

| Prefix | Written by | Contains | Removed by |
|---|---|---|---|
| `<subject>/…` | `S3StorageGateway` | user uploads | the resource's delete |
| `export/` | the tenant export job | a tenant's export archive | the bucket's lifecycle rule, after 7 days |
| `cold/` | tenant delete | a deleted tenant's archive | the nightly `retention` job, after 30 days |

- **Uploads are a real second source of truth** — Postgres has the metadata row and key, MinIO the
  bytes — so deleting a resource is two operations that can disagree if one fails.
- **One lifecycle rule, on `export/`**, converged by the nightly `retention` job (it reads the rules
  and writes the right one), so a fresh MinIO gets it on the first run.
- **`cold/` is swept by that job, not a rule**, once a deleted tenant's 30 days are up.

> Upload keys follow `<subject>/<yyyy>/<mm>/<uuid>.<ext>` — date-partitioned because
> lifecycle rules and cost reporting both work on prefixes, and a UUID rather than the original
> filename because filenames are user input.

No second bucket: the big kit's `loki` bucket and cold MinIO tier are not here — see
[logs](../../scale/logs.md) and [retention](../../scale/retention.md).

---

## `minio-init`

A one-shot container, not a service:

```yaml
minio-init:
  image: bitnamilegacy/minio-client:latest
  restart: "no"
  depends_on: [minio]
  entrypoint: >
    /bin/sh -c "
    until mc alias set local http://minio:9000 ratchet ratchetsecret; do sleep 2; done &&
    mc mb --ignore-existing local/ratchet &&
    mc anonymous set none local/ratchet &&
    echo 'buckets ready'
    "
```

It creates the bucket and exits — **`exited (0)` is success**; `restart: "no"` and no healthcheck,
since it is meant to stop.

- **`mc alias set local http://minio:9000`** — the service name; `localhost` is its own loopback.
- **`--ignore-existing`** — idempotent, safe on every `up`.
- **`mc anonymous set none`** — private. Files are served via presigned URLs from `S3StorageGateway`;
  a public bucket exposes any upload whose key is guessed.

Nothing in compose depends on it; the apps need the bucket only by their first upload, and
`compose-wait.mjs` holds the stack un-ready until it exits.

---

## Checking it

```bash
C="docker compose -f infra/docker-compose.yml"
MC="$C run --rm --entrypoint sh minio-init -c"

# the bucket exists
$MC "mc alias set l http://minio:9000 ratchet ratchetsecret >/dev/null && mc ls l"

# what the application has written
$MC "mc alias set l http://minio:9000 ratchet ratchetsecret >/dev/null && mc ls --recursive l/ratchet | head"
```

The server image ships no `mc`, so these borrow `minio-init`'s image, dialling `minio:9000` on the
network. The console at `http://localhost:29001` (same credentials) is the fastest way to inspect an
upload.

> **MinIO stopped publishing community images in October 2025** and pulled existing ones from Docker
> Hub and Quay, so `minio/minio` and `minio/mc` stopped resolving (a `403`, not a rate limit — waiting
> does not help) and took CI down. The server is now a community rebuild of
> `RELEASE.2025-10-15T17-29-55Z`, the last upstream release, pinned since nothing newer will come; `mc`
> is from Bitnami's frozen archive. Both are dev stand-ins, never run by a deployment.
