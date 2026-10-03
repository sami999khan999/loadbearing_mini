## What it is

The **worker** is a separate program that does slow or scheduled work, so that pages stay fast.
The web app only drops a job on the queue and answers straight away.

## What it does on request

| Job | Started by |
|---|---|
| Sending email | sign-ups, invitations, password resets, digests |
| Delivering events | every change that others must hear about, such as the bell |
| Notifications | the daily digest for each organization |
| Indexing documents | **AI document search**, when a document is added |
| Exports and deletes | the **Accounts** page |
| Re-rendering docs | `pnpm doc:rerender` |

## What it does on its own

All times are UTC.

| When | What |
|---|---|
| every second | delivers waiting events |
| every 5 minutes | keeps 20 empty organizations ready, so a sign-up is instant |
| 02:00 on the 1st, and at every start | prepares storage for the coming months |
| 03:00 daily | clears expired sessions, invitations, trials and exceptions |
| 03:30 daily | deletes old exports (after 7 days) and old tenant archives (after 30 days) |
| 04:00 daily | checks for data left behind by an unfinished delete; silence means all is well |
| 07:00 daily | sends each organization's notification digest |

## If the worker is stopped

Nothing is lost: jobs wait in the queue and run when it starts again. But until then no email is
sent, no export appears and no delete happens.

## Step by step: retrying failed jobs

A job that fails after its retries is kept for about a week.

:::steps
### Fix the cause

For example, start the mail server.

### Put the jobs back

```sh
pnpm queue:replay mail
```

The queue names are `mail`, `event`, `notification`, `embedding` and `maintenance`. Add a job name
to replay only those, for example `pnpm queue:replay maintenance tenant-export`.
:::

:::accordion{title="If the worker was down on the 1st of the month"}
Run `pnpm db:partitions` to prepare the month's storage by hand. The worker also does this every
time it starts.
:::
