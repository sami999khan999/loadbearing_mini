## What it is

Deleting a tenant removes an organization and all its data from the live database.

## Why it exists

For a customer who has left and asked to be removed, or an abandoned or abusive organization.

## How it works

The delete runs in the background worker, in this order:

:::steps
### Archive

Every month of the organization's data is copied to archive storage first.

### Remove

Then its data is removed from the database, together with its doc images and pending events.

### Forget

The organization row goes last, and the change is recorded in the platform's own history.
:::

The archives are kept for **thirty days**, then deleted by the nightly retention job.

> [!CAUTION]
> **There is no "undelete" button.** For thirty days the archived data still exists in storage,
> so a developer can reload it by hand if needed. After that it is gone for good.

## Step by step

:::steps
### Export first, if in doubt

A [tenant export](/docs/admin-guide/export) gives you a copy you control.

### Fill in the form

On **Accounts** (`/platform/accounts`), under the delete warning, enter the **Organization id**, then type the
organization's address in **Type the slug to confirm**. The server checks it too.

### Press Delete tenant

You see "Queued as …. Every month is archived before a partition is dropped."
:::

## Good to know

- The platform organization itself cannot be deleted.
- `pnpm db:partitions --sweep <organization id>` deletes a deleted tenant's archives **now**,
  instead of after thirty days. It cannot be undone.
- If a delete stops halfway (for example the worker crashed), the nightly orphan check at 04:00
  reports what was left behind.

## Who can use it

`platform.tenant.manage`.
