## What it is

A **tenant export** is a complete copy of one organization's data, as files you can download.

## Why it exists

A customer may ask for all their data, for example when they leave or for a legal request. It is
also a backup before something risky, such as a delete.

## How it works

The export runs in the background worker. It reads the organization's live data, so the customer
keeps working while it runs. You get:

- one file per table the organization owns, compressed (`.ndjson.gz`, one record per line);
- a **manifest**: a list of every file, with its row count, size and a checksum to prove it is
  complete.

Secrets are hidden: API keys and invitation codes are stored only as one-way fingerprints, and even
those are blanked in the export.

## Step by step

:::steps
### Find the organization's id

Look it up on **Accounts** or **Plans and entitlements**. The export needs the **id**, not the address.

### Start it

On **Accounts** (`/platform/accounts`), under **Export a tenant**, paste the **Organization id** and press
**Start export**. You see "Queued as …. Objects appear below once the worker finishes."

### Download

When the worker is done, the files are listed below with download links. Reload to see them.
:::

> [!WARNING]
> **Download links work for fifteen minutes.** Reload the list for fresh links. **The files
> themselves are deleted after seven days**, so download them soon.

## Good to know

- Starting a second export of the same organization on the same day reuses the first.
- The worker must be running, or the export waits in the queue.

## Who can use it

`platform.tenant.manage`.
