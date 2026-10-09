---
title: How everything works
description: The architecture in plain words — the programs that run, how the code is layered, and what happens, step by step, when someone signs in, clicks a button, reads a doc or waits for an email.
---

# How everything works

> Part of [the plain-language guide](index.md). This page explains how the parts fit together.
> The [codebase guide](codebase/index.md) describes every package and every file.

This is **loadbearing lite**, the small kit. It is the big kit with the heavy, scale-only
services removed and every seam kept, so each removed piece can be brought back without a rewrite.
[What the small kit leaves out](#what-the-small-kit-leaves-out) lists them.

## The short version

loadbearing is a starter kit for a multi-tenant web product: many customer **organizations** share
one deployment, and none can ever see another's data.

Three programs run:

| Program | What it does |
|---|---|
| **Web app** (`apps/web`) | Serves every page and the API. Renders pages on the server, then React takes over in the browser. |
| **Worker** (`apps/worker`) | Does everything that should not make a person wait: sending email, delivering notifications, indexing documents, nightly housekeeping. |
| **Realtime app** (`apps/realtime`) | Holds every open live connection, so a browser hears about changes the moment they happen. |

They share one codebase of packages and talk to these services:

| Service | Used for |
|---|---|
| **Postgres** (with pgvector) | All real data: organizations, users, roles, docs, notifications, the audit log, and the vectors for AI search. |
| **Redis** (one instance) | Caching, the job queues and live messages. The code still treats cache and queue as two connections, so they can be split later by changing one setting. |
| **S3** (MinIO locally) | Files: doc images and tenant exports. |
| **SMTP** (Mailpit locally) | Sending email. Mailpit catches every message in a local inbox. |

**The one rule behind every storage decision:** Postgres owns anything a transaction depends on or
a person reads back straight after writing. Everything else is a copy that can be rebuilt, a queue
of work, or a cheap shelf for old data. If deleting some store would lose information you cannot
rebuild from Postgres or S3, that store has quietly become a source of truth, and that is a bug.

```
 browser ──▶ web app ──▶ Postgres        (the truth)
    ▲           │   └──▶ Redis cache     (copies, rebuildable)
    │           └──────▶ Redis queue ──▶ worker ──▶ email, notifications, indexing
    │                                       │
    └──── realtime app ◀── Redis pub/sub ◀──┘     (live "something changed" messages)
```

## How the code is layered

Every package sits in a layer, and a package may only import from layers to its left. The build
fails if one reaches the other way.

```
errors → core → permissions · observability → contracts → asset · content
                                                             ↓
                         application → infrastructure → auth → composition → api-server
                                                                                  ↓
                         ui → api-client → query → feature → apps/web, apps/worker, apps/realtime
```

In plain words:

1. **Shared vocabulary** (`errors`, `core`, `permissions`, `observability`, `contracts`, `asset`,
   `content`). The shapes and words every runtime agrees on: error codes, IDs, permissions, the API
   contract, every user-visible sentence. None of it touches a database.
2. **Business logic** (`application`). Every action is a *use-case* class. A use-case says what it
   needs through *ports*: abstract classes such as "a place to store members" or "something that
   sends email". It never names Postgres, Redis or any framework. The build checks this.
3. **Real adapters** (`infrastructure`). The actual implementations of the ports, one folder per
   vendor: `pg/`, `redis/`, `s3/`, `bullmq/`, `smtp/`, and so on.
4. **Sign-in** (`auth`). Turns a cookie, token or API key into a `Principal`: who is acting, where,
   and with what permissions.
5. **Wiring** (`composition`). One hand-written `Container` class creates every real adapter and
   every use-case and hands them to the apps. It is the only place a concrete adapter is chosen.
6. **The API's server half** (`api-server`). The middleware every API call passes through.
7. **The browser side** (`ui`, `api-client`, `query`, `feature`). Design system, typed API client,
   data fetching and caching, and the screens' building blocks.
8. **The apps** (`apps/*`). Thin programs that start a server or a worker and route requests to the
   layers above. No business logic lives in an app.

**Why it is built this way.** The business logic is the expensive part to write and the part that
lasts. Frameworks, databases and vendors change. Because `application` only knows ports, swapping
OpenAI for another provider, or Redis for something else, means writing one adapter and changing one
line in the container. Nothing above it notices.

**The server-only boundary.** Database code, secrets and the container must never end up in a
browser bundle. Lint rules forbid the browser packages (`ui`, `query`, `feature`, `content`,
`asset`, `errors`) from importing server packages. In the web app, only `apps/web/src/server/` and
files named `*.server.ts` may touch server code, and a CI check looks for server code in the built
browser bundle.

## Following one click

Here is what happens, start to finish, when an admin invites a teammate.

### While the person waits

1. **The browser calls the API.** The invite form calls `member.invite` through the typed client.
   It is a `POST` to `/api/rpc/member/invite`, with the session cookie attached.
2. **The middleware chain runs** (`packages/api-server/src/router/base.ts`), in order:
   - It gives the request a **trace ID**, or adopts one from an upstream proxy, so every log line
     for this request can be found together.
   - It builds the **principal**: who is asking, in which organization, with which permissions. The
     session comes from Better Auth (Redis first, then Postgres). The permissions come from a
     60-second Redis cache, or are resolved from Postgres on a miss.
   - It checks the **rate limit**, for the few endpoints that cost money or send email.
   - It **places the request** on the organization's database node (in the small kit there is one node, but the step still runs).
   - It wraps everything in **error handling**, so whatever goes wrong comes back as a clean error
     code, never a stack trace or a database message.
3. **The endpoint is checked against its permission.** Every endpoint has an entry in a map saying
   which permission it needs. An endpoint missing from the map is refused, so nothing ships ungated
   by accident.
4. **The use-case runs** (`InviteMemberUseCase`). Its first line is
   `Authorizer.assert(principal, "member.invite")`. This is the real gate: menus, page guards and
   hidden buttons are conveniences, and this check runs no matter how the call arrived (browser,
   server rendering or worker). Then it checks the business rules: the role must exist in this
   organization, and you cannot invite someone into a role that outranks you.
5. **One transaction writes three things together:**
   - **the invitation** (only a digest of its secret token is stored, never the token itself);
   - **an audit row** in `activity_log`: who invited whom, when;
   - **an outbox row** in `outbox_event`: a message for the rest of the system saying
     "member.invited".

   They commit together or not at all. The outbox exists because of a real failure: if the code
   sent a queue message directly and the transaction then rolled back, an email would go out about
   an invitation that does not exist. Writing the message into the same database transaction makes
   that impossible.
6. **Right after the commit, the email is queued.** The use-case puts an "invitation" job on the
   mail queue, carrying the secret link. This one step is outside the transaction on purpose: the
   token must never be stored in a row (not even the outbox), so it can only travel in the job. If
   the process crashed in that instant, an admin would press "Resend", which issues a new token.
7. **The response goes back** and the screen updates. That is the whole synchronous path. Nothing
   has been emailed yet.

### After the response

8. **The worker sends the email.** It renders the invitation from its template, in the recipient's
   language, as text and HTML, and sends it over SMTP. A failed send is retried with growing delays;
   a job that keeps failing is kept for a week and can be replayed with `pnpm queue:replay`.
9. **Within a second, the worker drains the outbox.** It claims unsent rows with a short lease,
   puts one job per interested subscriber on the event queue, and marks the rows sent. If the
   worker dies mid-way, the lease expires and another run picks the rows up. Every subscriber is
   written to be safe if the same event arrives twice.
10. **Open screens refresh themselves.** A subscriber publishes a small "members changed" message to
    Redis. The realtime app forwards it to every open tab in that organization, and each tab
    refetches its member list. The message never carries data; it only says what to refetch, so it
    cannot leak anything the tab may not see. Other subscribers react to the same event in their own
    way, such as creating notifications for events that have recipients.

## Pages and server rendering

The web app is built on **TanStack Start**. Each file in `apps/web/src/route/` is one URL.

When a page is requested:

1. The server works out the **session** (who you are, your organizations, permissions and flags),
   the **appearance** (theme, light or dark, font, language) from cookies, and the **text** the page
   needs.
2. The page's **loader** asks for its data through the same typed API client the browser uses. On
   the server, that client calls the API **in-process**, skipping the network but running the same
   middleware and permission checks.
3. React renders the page to HTML. The colours are right from the first byte, because the theme was
   read on the server.
4. The HTML is sent along with everything already fetched, so the browser does not fetch it again.
   React then takes over (hydration), and from then on navigation happens in the browser.

**Text.** Every word comes from the `content` package, in English or Bengali. Text is split into
namespaces (`auth`, `doc`, `platform`, …), and a page loads only the ones it needs.

**Data in the browser.** TanStack Query caches every read. Each read declares how long it stays fresh,
and each write declares which reads it makes stale. Some writes update the screen instantly and roll
back if the server says no.

**Production.** `apps/web/cluster.mjs` runs one web process per CPU core and replaces any that crash.

## Who you are: sign-in and sessions

Sign-in is built on **Better Auth**, configured in one place (`packages/auth/src/factory/auth.factory.ts`).

- **Ways in:** email and password (with email verification), Google (when configured), and
  two-factor as a second step (an authenticator app, an emailed code, or a backup code).
- **Sessions** are stored in Postgres, with a copy in Redis so most requests never hit the database.
  The browser holds a cookie; the desktop app would send a bearer token instead.
- **Every session points at one organization.** A session without a membership is refused. A user
  can belong to many organizations and switch between them; switching re-points the session and
  clears the browser's cache, because everything cached belonged to the organization being left.
- **Which organization a new person joins** is set by `AUTH_ENROLMENT_MODE`:

  | Mode | What happens |
  |---|---|
  | `personal` (default) | Each new user gets an organization of their own, as its owner. Works on an empty database. |
  | `bootstrap` | Everyone joins one organization. The first person in becomes its owner. |
  | `invite` | Nobody joins without an invitation. The production setting for a closed product. |

  In every mode, an address with a pending invitation joins the inviting organization instead. The
  verified email address is what proves the invitation is yours; the link only finds it.
- **API keys** let a program act for an organization. Only a digest is stored and the key is shown
  once. On every request, the key's permissions are narrowed to what its issuer can still do, so
  taking a permission from a person also takes it from every key they made.
- **Suspension.** The platform can suspend an account in every organization at once, which also
  ends all of its sessions.

## What you may do: permissions

Access has several layers. Each one can only narrow the one above it, never widen it.

| Layer | Who controls it | What it does | What the API answers |
|---|---|---|---|
| **Feature flag** | Engineers, temporarily | Turns an unfinished feature on for the whole deployment or for chosen organizations. Every flag has an owner and an expiry date. | Not found |
| **Module switch** | Super admin, in an incident | Turns a whole module off for everyone. | Forbidden |
| **Plan (entitlement)** | Super admin | What an organization's plan includes, plus per-organization extras or removals (such as a trial). | Forbidden |
| **Role** | The organization's admins | The permissions each role grants. Every organization gets owner, admin, member and guest, and can create its own. | Forbidden |
| **Override** | The organization's admins | One extra permission (expires within 90 days) or one removed permission for one person. | Forbidden |

**How a permission is resolved** (`CapabilityResolution`): start from the person's role grants, add
their extra grants, apply every denial (a denial always wins), then let the plan filter what is left.
A plan never deletes a grant, it only hides it, so moving back to a bigger plan restores everything at
once. The `core` permissions everyone holds are never filtered.

**Where checks happen.** The menu hides modules you cannot use, page guards redirect you, and the
`<Can>` component hides buttons. All of that is courtesy. The real check is `Authorizer.assert` inside
every use-case on the server.

**Caching.** Resolved permissions are cached in Redis for 60 seconds, and every change that affects
them clears the cache straight away. The 60 seconds is a safety net for a missed clear: it is the
longest a revoked permission can keep working.

**No escalation.** Nobody can give a role, a person or an API key a permission they do not hold
themselves, and nobody can change someone who outranks them. The last owner of an organization
cannot be removed or demoted.

### The super admin (platform) organization

The people who run the deployment are not a special kind of user. They are members of one ordinary
organization marked as the **platform organization** (`organizations.is_platform`; at most one exists,
and `pnpm db:seed` creates it as `loadbearing`).

- Its top role, `platform_admin`, holds every **platform** permission (`platform.*`) plus every normal
  permission, so the platform organization is run like any other: it invites staff, builds roles and
  writes docs.
- Platform permissions live on a separate axis. No customer organization's owner can ever hold one,
  even with every other permission.
- A platform admin who switches into a customer organization is still a platform admin, but holds
  only the role that organization gave them there.
- The first admin cannot be created through the API (nobody holds the permission to grant it yet), so
  it comes from a command: `pnpm platform:grant <email>`. Every later admin is invited normally.

The platform pages live under `/platform`: accounts (find, suspend, deny, export and delete
an organization), entitlements and plans, feature flags, and system status. Each page needs its own permission, so a staff role
can hold some pages and not others.

## Organizations and where data lives

**Every customer row carries its organization.** Every domain table has an `organization_id` column,
every unique index starts with it, and every query is scoped by it. A repository method cannot be
called without the organization, so forgetting the scope is a compile error rather than a data leak.

**Big tables are split.** Postgres *partitions* let one table be stored as many smaller ones. Every
organization-owned table is split by organization, and the ones that grow with activity are split
again by month:

| Table | Split by organization | Split by month |
|---|---|---|
| `activity_log` (audit) | yes | yes |
| `outbox_event` | no | yes |
| `notifications` | yes | yes |
| `doc_revision` | yes | yes |
| `notification_preferences`, `document_chunks` | yes | no |
| `doc_spaces`, `doc_pages`, `doc_sections` | yes | no |

This keeps each organization's data physically together, makes queries skip partitions they cannot
match, and turns deleting an organization (or an old month) into dropping a few partitions instead
of deleting rows one by one. The cost is that partitions must exist before rows arrive, so creating an
organization creates its partitions, and the worker creates next months' partitions ahead of time
(on the first of each month, and at every start-up). A pool of spare pre-made partitions keeps
sign-ups fast.

**Every table has a placement.** Each table is one of three kinds (`packages/application/src/primitive/shard.ts`):

- **catalog**: shared, deployment-wide tables read before any organization is known: users,
  sessions, organizations, roles, memberships, plans, flags, doc grants.
- **routed**: organization-owned tables, which live on that organization's database node.
- **local**: the audit log and the outbox, present on every node.

A repository declares its placement, and using a catalog repository inside a routed transaction
throws, even when there is only one database. That way, code that would break when the data is split
across machines fails in a test today.

**One database node.** The small kit runs one Postgres. The routing code, placements and
per-node loops are all kept, so adding nodes later is configuration plus the pieces in
`docs/scale/`, not a rewrite.

**Transactions.** `UnitOfWork.run(work)` runs the work in one transaction. Repositories inside it
join the same transaction automatically, nested calls share it, and the audit row and outbox row
always commit with the change they describe.

**Migrations.** The schema is written in TypeScript with Drizzle (`packages/infrastructure/src/pg/schema/`).
`pnpm db:generate` writes a migration, adding the partitioning Drizzle cannot express, and
`pnpm db:migrate` applies pending migrations to every node, then makes sure every organization has
its partitions. The small kit starts from one squashed baseline migration plus three small ones.

## Old data: retention

**Nothing is ever dropped by age in the small kit.** Months stay in Postgres forever, and there
is no cold storage. The only things deleted are expired sessions, tokens and invitations (nightly),
and an organization's data when a super admin deletes the organization. That delete keeps a
compressed archive of each table in S3 for 30 days. Retention with archiving comes back from
`docs/scale/retention.md`.

## Background work

The worker runs one consumer per queue. Each queue is a separate lane, so slow work never blocks
urgent work:

| Queue | Work |
|---|---|
| mail | Every email the system sends. Rate-limited for the provider. |
| event | Domain events fanned out from the outbox to their subscribers. |
| notification | Turning events into notifications, and the daily digest. |
| embedding | Indexing documents for AI search. |
| maintenance | Housekeeping, tenant export and delete, re-rendering docs. |

Scheduled jobs (times in UTC):

| When | Job |
|---|---|
| Every second | Drain the outbox on every database node. |
| Every 5 minutes | Top up the pool of spare organization partitions. |
| 02:00 on the 1st of the month | Create the next months' partitions. |
| 03:00 nightly | Delete expired sessions, verification tokens, invitations, entitlement trials and per-person grants. |
| 03:30 nightly | Retention pass: keep the bucket's lifecycle rules in step and remove deleted organizations' archives after 30 days. |
| 04:00 nightly | Count rows left behind by deleted organizations (should be zero). |
| 07:00 daily | Send the notification digest, one job per organization. |

Jobs act as a **system principal** for the organization they work on, with a short, reviewed list of
permissions rather than "everything". Jobs retry with growing delays, are safe to run twice, and
failed ones are kept for a week.

## Live updates

The browser keeps one long-lived connection open per tab to `/api/realtime`. A proxy sends that path
to the realtime app (in development, Vite does it).

1. Something changes, and a subscriber in the worker (or a use-case in the web app) publishes a small
   message on a Redis channel. Channel names always start with the organization, and each signed-in
   user has their own channel, so a message only ever reaches people it was meant for.
2. The realtime app holds one Redis subscription for the whole process and hands each message to the
   right open streams.
3. In the browser, a routing table maps each message to the cached data it makes stale, and those
   reads refetch (at most once a second each, even during a burst).

Messages carry IDs, never content to display. Redis keeps a short history per channel, so a tab
that reconnects is sent what it missed instead of refetching everything. An open stream re-checks
every minute that the person may still hold it, and ends it if they have been removed.


## Email

**Every email is a queue job**, including sign-in emails from Better Auth. That gives one send path
with retries, priorities (a verification link someone is waiting for goes first) and a rate limit.

The worker checks the job against the list of templates, renders it from the `email` text in the
recipient's language into a simple layout (text and HTML), and sends it over SMTP. Locally every mail
lands in Mailpit, at `http://localhost:28025`. **If the worker is not running, no
email is sent**, including sign-up verification.

## Notifications

When an event happens, the **notification policy** decides who hears about it, in which category, and
by default how (in-app at once, a daily digest email, or off). Each person can change that per
category and channel. Delivery writes the in-app rows (a replayed event writes nothing twice), queues
any emails, and pushes a live message so the bell updates. The unread count is cached for a minute.


## The docs system

The app includes a full documentation system, used both for each organization's own docs and for the
platform's public docs.

- **Spaces and pages.** A space is a docs section with its own sidebar, theme, icon and GitHub link.
  Pages nest inside pages. A sidebar entry can be a page, a section heading or an outside link.
- **Drafts and publishing.** Each page row holds the draft and the published copy side by side, so
  writers can edit without readers seeing it. Publishing renders the Markdown to safe HTML **once**,
  then in one transaction saves the published copy, adds a revision, rebuilds the space's ready-made
  sidebar and replaces the page's search sections. Reading never renders anything.
- **Fast reads.** A page read is one row, and the sidebar is one column. Both are cached in Redis, and
  a published page's cache key includes its revision, so it never goes stale. Public pages are also
  cacheable by a CDN for signed-out visitors.
- **Who can read.** A space's audience is one of: **members** of its organization, **owner** (only its
  author), **public** (anyone, signed in or not), or **granted** (chosen organizations, people or
  plans). Public and granted are only for the platform organization's spaces, served at `/docs`. An
  organization's own docs are at `/doc`.
- **Access links.** A space or page can be tied to a module, permission, flag or plan. Every link
  must pass. A reader who fails one gets "not found": the doc is missing from the sidebar, search,
  `/llms.txt` and the raw Markdown, so it cannot be discovered.
- **Search.** Full-text search across every space the reader may read, grouped by space, using
  Postgres's own search (no AI needed). Titles also match by typo-tolerant trigram.
- **Markdown features.** GitHub callouts, highlighted code, tabs, steps, accordions, cards with icons,
  images.
- **Reader extras.** Breadcrumbs, previous and next links, "On this page", Copy Markdown, "Open in
  ChatGPT / Claude", six themes with light and dark.
- **Images** are uploaded by the browser straight to S3 with a short-lived signed URL. Pages link to
  the app (`/api/doc-image/...`), which checks the reader may read the page before redirecting to a
  short-lived signed URL. The bucket is never public.
- **For agents.** `/llms.txt` lists every public page, and `/api/doc/<space>/<path>` serves a public
  page's Markdown.

The **super admin guide** (`tooling/scripts/guide/`) is written as Markdown in the repository and
published into the app's docs with `pnpm guide:publish`, through the normal API.

## AI document search

Documents can be indexed and searched by meaning.

1. Indexing a document stores its text in the bucket (`embedding/<org>/<document>/<version>.txt`), puts
   a job holding only that key on the embedding queue, and returns at once. The text stays out of
   Redis; the worker deletes it after indexing, and the nightly orphans job sweeps any a week old.
2. The worker splits the text into chunks, asks the AI provider for a vector per chunk (in batches),
   and replaces the document's old chunks in one transaction.
3. Searching turns the question into a vector and finds the closest chunks with **pgvector**, inside
   Postgres, filtered to what the person may read before ranking, with a minimum score.

The provider is chosen with `EMBEDDING_PROVIDER`: `none` (the default: plain full-text search,
no AI key, no outside calls), `openai` or `gemini`. Each chunk records which model made its vector, and
after switching provider `pnpm ai:reindex` re-embeds the old ones.

## Errors and logging

**Errors carry a code, never a sentence.** Every failure is an `AppError` with a code from a closed
list (`NOT_FOUND`, `FORBIDDEN`, `CONFLICT`, `RATE_LIMITED`, …) and structured details. Anything else
thrown is turned into `INTERNAL`, and its original message stays in the server log. The browser
receives `{ code, details, traceId }` and shows the sentence for that code in the user's language. A
support request can quote the trace ID to find the exact log line.

**Logs carry a code too.** Every log line names an event from a closed list, which decides its level.
Fields that look secret are redacted. Logs are for diagnosing the system; the record of who did what
is the audit log in Postgres.

## Look and feel

The design system (`packages/ui`) uses React, Tailwind and Base UI (which handles focus, keyboard and
accessibility behaviour).

- **Twelve colours.** Every colour in the product is one of twelve named tokens: background, surface,
  muted, border, text, muted text, primary, text on primary, success, warning, danger, focus ring.
  Tailwind's own palette is removed, so nothing else can be used, and a CI check rejects any literal
  colour.
- **Six themes** (slate, forest, graphite, midnight, ocean, plum) each define those twelve for light
  and dark (midnight is dark only). A script checks every text and background pair in every theme is
  readable.
- **Hover and pressed states** are mixed from the twelve, not separate colours.
- A doc space can open in its own theme, applied only inside the reader.

## Configuration

**One settings file.** Everything is configured through one `.env` at the repository root, copied
from `.env.example`. Each app reads and validates it once, at start-up, in its own `env.ts`; a missing
or invalid value stops the app from starting rather than failing an hour later. Nothing else in the
code reads the environment.

Local ports are the usual ones with a `2` in front, so they do not clash with other
projects:

| Service | Port |
|---|---|
| Web app | 23000 |
| Realtime app | 23001 |
| Postgres | 25432 |
| Redis | 26379 |
| MinIO (S3) and its console | 29000, 29001 |
| Mailpit inbox | 28025 |

**Starting from nothing:**

```bash
pnpm install
cp .env.example .env
pnpm infra:up                 # start the Docker services
pnpm build:packages           # build the packages once
pnpm db:migrate && pnpm db:seed
pnpm dev                      # web, worker and realtime together
```

Then sign up at `/sign-up`, confirm the email in Mailpit, and, to become super admin, run
`pnpm platform:grant <your email>`.

## How it is checked

| Check | What it catches |
|---|---|
| Unit tests | Use-cases run against in-memory fakes from `TestContainer`: permission checks, business rules, that every write is audited. |
| Integration tests | Repositories run against a real Postgres, Redis and MinIO: queries, transactions, partitions, query counts. |
| Smoke tests (`pnpm smoke`) | Against the running Docker stack: storage, Redis, live streams, and a real sign-up through to a live message. |
| `pnpm check:architecture` | About thirty rules no linter expresses, such as the business layer importing a framework, server code in the browser bundle, a table without `organization_id`, a docs path that names a missing file, a colour outside the twelve. |
| `pnpm check:contrast` | Every colour pair in every theme is readable. |
| Type-check and lint | TypeScript strict mode, Biome and ESLint, including the import boundaries. |

CI runs all of these on every push, boots each built app once to catch start-up failures, and runs
the smoke tests against the full stack. Git hooks check commit messages and run the fast checks
before a push.

## What the small kit leaves out

Each piece below was removed from the big kit, and its seam was kept. `docs/scale/` explains how to
bring each one back.

| Removed | What the small kit does instead |
|---|---|
| A second Redis | One Redis serves cache, queue and live messages, under two setting names. |
| pgBouncer | Direct connections. The code is already written to work behind a pooler. |
| Read replica | Every read goes to the one database. |
| ClickHouse analytics | No analytics store, and no activity screen. |
| Retention and cold storage | Months are kept in Postgres forever. |
| Loki and Alloy | Logs go to standard output only. |
| Extra database nodes and tenant moves | One node. The routing stays. |
| Messaging | No conversations. |
| Dashboard widgets and zones | The dashboard is static. |

The small kit also built things first. The private `owner` doc audience, access links on docs, the
docs reader additions and the platform organization changes have since been copied into the big kit.
Search without an AI key and Gemini embeddings have not. `docs/scale/back-ports.md` tracks each one.

## Where to look next

- [The codebase guide](codebase/index.md): every package and every file, in plain words.
- [How data flows](../data-flow.md): one request followed from arrival to years later.
- [The rules](../ai/rules/index.md) and [the arguments behind them](../opinions/index.md).
- [The build order](../setup/index.md), from an empty folder to the running app.
- [The running stack](../infra/index.md) and [deployment](../infra/deployment.md).
- [Bringing back what the small kit removed](../scale/index.md).
