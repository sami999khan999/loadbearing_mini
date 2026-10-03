## What it is

Where every kind of data is kept, and how the app keeps one organization's data away from another's.

## The stores

| Store | Keeps | If it were lost |
|---|---|---|
| **Postgres** | everything that matters: accounts, organizations, roles, docs, the audit history | real loss; this is the one to back up |
| **Redis (cache)** | short-term copies, such as each person's permissions for 60 seconds | nothing; it refills itself |
| **Redis (queue)** | background jobs waiting to run | the waiting jobs would never run |
| **S3 storage** | doc images, exports, tenant archives | the files themselves |

## Why tenants never see each other

:::steps
### Every row is labelled

Every piece of customer data carries the id of the organization it belongs to.

### Every question asks for one organization

The app never asks the database "show me all documents", only "show me this organization's
documents". There is no code path that reads across organizations.

### Each organization has its own shelf

Inside the database, each organization's data sits in its own partition, a separate slice of each
table. Deleting a tenant removes its slices whole.
:::

## The history of who did what

Every important change, such as a role edited, a member invited or an account suspended, is written to
an audit history in the same moment as the change itself. A change cannot happen without its record.
Platform actions are recorded in the platform organization's history, and also in the affected
organization's history.
