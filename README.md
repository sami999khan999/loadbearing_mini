<div align="center">

# loadbearing lite

**The big kit with the scale stores removed and every seam kept.**

TanStack Start + oRPC · standalone worker · realtime stream process · Postgres + pgvector ·<br>
one Redis (cache + queue) · S3 · logs to stdout

<br>

![Node](https://img.shields.io/badge/node-%E2%89%A5%2024-5FA04E?style=flat-square&logo=nodedotjs&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-%E2%89%A5%2011.21-F69220?style=flat-square&logo=pnpm&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TanStack Start](https://img.shields.io/badge/TanStack-Start-FF4154?style=flat-square&logo=reactquery&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Postgres-pgvector-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-one%20instance-FF4438?style=flat-square&logo=redis&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)

**[Quick start](#-quick-start)** ·
**[Architecture](#-architecture)** ·
**[Big kit vs lite](#-big-kit-vs-lite)** ·
**[Documentation](#-documentation)**

</div>

<br>

> [!NOTE]
> This is **lite**, cut from the big kit,
> **[loadbearing](https://github.com/sami999khan999/loadbearing_large)**. It has the same packages,
> the same `@loadbearing/*` scope and the same rules. [`UPSTREAM.md`](UPSTREAM.md) records the
> commit it was cut from, and [`docs/scale/`](docs/scale/index.md) is the way back to each removed
> piece when a project outgrows this one.

<br>

## ✦ Highlights

<table>
<tr>
<td width="50%" valign="top">

**🧱 Layered, port-and-adapter packages**<br>
Sixteen `@loadbearing/*` packages whose dependencies point one way. The domain names no
framework and never logs, and CI fails the build if it starts to.

</td>
<td width="50%" valign="top">

**🗄️ Small today, ready to shard**<br>
One node runs, but every tenant table is still partitioned by `organization_id`, every repository
still declares where its tables live, and every connection is written for pgBouncer.

</td>
</tr>
<tr>
<td valign="top">

**🔐 Auth, RBAC and entitlements**<br>
Better Auth sessions, organizations with four system roles, per-plan entitlements and feature
flags. All of them are enforced on the server.

</td>
<td valign="top">

**📬 One send path for every message**<br>
Mail is a BullMQ job, rendered and sent by the worker with retries, backoff and a rate
limiter. It is never sent from inside a request.

</td>
</tr>
<tr>
<td valign="top">

**🎨 Six themes, twelve colours**<br>
Every colour is one of twelve tokens. `pnpm check:contrast` checks 154 pairings against WCAG AA
in every theme and mode.

</td>
<td valign="top">

**🛡️ 31 architecture assertions**<br>
`pnpm check:architecture` catches what typecheck, lint and tests miss: framework leaks,
missing tenant scope, stale doc paths, port drift and more.

</td>
</tr>
</table>

<br>

## ✦ Stack

| Layer | Choice |
|---|---|
| **Web** | TanStack Start · React 19 · Tailwind 4 · oRPC |
| **Processes** | `apps/web` · `apps/worker` · `apps/realtime` |
| **Database** | Postgres + pgvector · Drizzle ORM · one node, dialled directly |
| **Cache & queue** | One Redis under `noeviction`, still read through two env names · BullMQ |
| **Storage** | S3 (MinIO locally) |
| **Logs** | JSON to stdout |
| **Search** | Postgres full-text by default; OpenAI or Gemini embeddings when switched on |
| **Mail** | SMTP, caught by Mailpit in development |
| **Copy** | `@loadbearing/content`, in English and Bangla |

<br>

## ✦ Architecture

A package may import from anything to its left, never from anything to its right.

```mermaid
flowchart LR
  errors --> core --> permissions & observability --> contracts --> asset & content
  asset & content --> application --> infrastructure --> auth --> composition --> api-server
  api-server --> ui --> api-client --> query --> feature --> apps["apps/{web,worker,realtime}"]
```

- **`packages/application`** is the domain. It names no framework and never logs.
- **`packages/infrastructure`** is organized by vendor (`pg/`, `redis/`, `s3/`, `smtp/` …), so swapping a vendor means deleting one folder.
- **`packages/composition`** is the DI root, and the only place a concrete adapter is named.
- **`apps/*`** are thin, framework-shaped and deletable. Business logic never lands there.

The full rules are in [`docs/ai/rules/layering.md`](docs/ai/rules/layering.md).

<br>

## ✦ Quick start

> **Requirements:** Node ≥ 24, pnpm ≥ 11.21, and Docker running.

```bash
pnpm install
node -e "require('fs').copyFileSync('.env.example', '.env')"   # then set AUTH_SECRET
pnpm infra:up                                                  # the whole local stack
pnpm db:migrate && pnpm db:seed
pnpm dev                                                       # web + worker + realtime
```

Then open **http://localhost:23000/sign-up**. The verification mail lands in Mailpit at
**http://localhost:28025**.

<details>
<summary><b>Step by step, with the reasons</b></summary>

<br>

**1 · Install and configure.** Copy the template whole. Every required key has a working local
value in it, and `apps/web/src/env.ts` parses the entire schema at module load, so a missing key is
a boot failure rather than a 500 an hour later.

Then set a real `AUTH_SECRET` in `.env` (`openssl rand -hex 32`). The template's `change-me` is too
short for the web app's schema. Search needs no key by default: `EMBEDDING_PROVIDER=none` is
Postgres full-text search, and `openai` or `gemini` switch it to embeddings. See
[reference/embedding](packages/infrastructure/docs/reference/embedding.md).

**2 · Host ports, if any are taken.** Every published port is the well-known one with a `2` in
front, so this stack does not fight another one on your machine. Inside the compose network nothing
moved: `postgres:5432` is still `postgres:5432`.

There is **one env file**, the `.env` at the root, and both halves of a port live in it. Change the
`*_PORT` that compose publishes and the URL that dials it together:

```bash
POSTGRES_PORT=25432
DATABASE_URL=postgres://ratchet:ratchet@localhost:25432/ratchet
```

`POSTGRES_PORT` `REDIS_PORT` `S3_PORT` `MINIO_CONSOLE_PORT` `SMTP_PORT` `MAILPIT_UI_PORT` and
`WEB_PORT` are the full set, and each one is documented in `.env.example`. `check:architecture`
§27 fails the build if a `*_PORT` and the URL beside it disagree. Without it, that mistake shows up
as a connection refused that names nothing.

For the web app, change `WEB_PORT`. `apps/web/vite.config.ts` reads it, and `APP_BASE_URL`,
`AUTH_URL` and `AUTH_TRUSTED_ORIGINS` must all name it. Better Auth signs cookies against `AUTH_URL`,
and the CORS layer reads `AUTH_TRUSTED_ORIGINS`. §27 checks all three.

**3 · Infrastructure.** Five containers: Postgres + pgvector, one Redis (`noeviction`, because it
holds the queue as well as the cache), MinIO with its one-shot bucket init, and Mailpit. See
[docs/setup/11](docs/setup/11-local-infrastructure.md).

```bash
pnpm infra:up
node tooling/scripts/compose.mjs ps   # wait until all are healthy
```

**4 · Database.**

```bash
pnpm db:migrate        # drizzle migrations, including Better Auth's own tables
pnpm db:seed           # the `loadbearing` organization + the four system roles
```

`db:seed` prints `seed complete: <organizationId>`. It creates no user: the first person to sign up
is enrolled into that organization. `pnpm auth:tables` creates nothing either. It prints what
Better Auth's tables must look like in the pinned runtime, to diff against `auth.schema.ts` after
an upgrade.

**5 · Run.** `pnpm dev` builds the packages first, then runs web, worker and realtime in parallel.
Each one loads the root `.env` itself. `pnpm dev:web` runs the web app alone.

**6 · First sign-in.** Sign up at `/sign-up`. `AUTH_REQUIRE_EMAIL_VERIFICATION` defaults to on, so
the verification mail lands in Mailpit. Open it and click through.

</details>

<br>

### Local URLs

| Service | Address |
|---|---|
| 🌐 Web app | http://localhost:23000 |
| 📬 Mailpit, which catches every outgoing mail | http://localhost:28025 |
| 🪣 MinIO console | http://localhost:29001 |
| 💓 Readiness probe | http://localhost:23000/api/health |
| 🗃️ Drizzle Studio | `pnpm db:studio` |

> [!IMPORTANT]
> Every message in this system is a job on `QueueName.MAIL`, rendered and sent by the worker, so
> **nothing reaches Mailpit unless the worker is running**. `pnpm dev` starts it. The reasoning is
> in [`mail-pipeline.md`](packages/composition/docs/reference/mail-pipeline.md).

<br>

## ✦ Accounts and organizations

**No session is ever issued without a membership**, so `AUTH_ENROLMENT_MODE` decides how you get
one:

| Mode | What happens on sign-up |
|---|---|
| `personal` *(default)* | You become `owner` of a new organization of your own, with the four system roles. It is the only mode that works against an empty database. |
| `bootstrap` | Everyone joins the one organization `BOOTSTRAP_ORGANIZATION_SLUG` names. The first person in becomes `owner`. |
| `invite` | An invitation is the only way in. This is the production posture. |

In every mode, an address with a pending invitation joins the organization that invited it instead.

**Try the permission gates.** `owner` holds `rbac.role.read`, so `/settings/roles` renders. Invite
a second address from `/settings/members` and accept it in another browser profile. That `member`
account is redirected to `/forbidden`, which shows the route guard and the use-case gate making the
same decision.

<br>

## ✦ Before committing

```bash
pnpm check:architecture   # needs pnpm build:packages + a web build, or two assertions skip
pnpm typecheck && pnpm lint && pnpm test
```

<details>
<summary><b>When it does not come up</b></summary>

<br>

| Symptom | Cause |
|---|---|
| 500 on the first request, with a `ZodError` naming env keys | `.env` is missing or incomplete. Redo step 1. |
| `/api/health` returns 503 | A container is not up, or a URL in `.env` names the wrong host port. |
| `ECONNREFUSED` from `db:migrate` | Postgres is not healthy yet, or something else holds the port. |
| Signed up, but the shell still renders signed-out | No membership. Under `bootstrap`, `BOOTSTRAP_ORGANIZATION_SLUG` is unset or `db:seed` never ran. Under `invite`, there is no invitation for the address. |

</details>

<br>

## ✦ Big kit vs lite

Both kits share the same packages, the same `@loadbearing/*` scope and the same rules. The
difference is which stores are running.

| | **[loadbearing](https://github.com/sami999khan999/loadbearing_large)** | **loadbearing lite** *(this repo)* |
|---|---|---|
| Postgres | pgBouncer · read replica · shard nodes | one node, dialled directly |
| Redis | two instances, cache and queue | one instance, `noeviction` |
| Logs | stdout → Alloy → Loki | stdout |
| Analytics | ClickHouse, behind a flag | not built |
| Retention | archive-then-drop to S3 `cold/` | partitions kept, never dropped |
| Widgets and zones | ✅ | not built |
| Seams | ✅ all built | ✅ all built |
| Host ports | `1xxxx` | `2xxxx` |

**What lite leaves out, it keeps ready.** Every table is still partitioned by tenant, every
repository still declares its shard placement, and `DATABASE_URL` is written as if a pooler sat in
front. *Building the seam* and *starting the store* are separate decisions, and only the second
costs anything to get wrong. Each store comes back by its page in
[`docs/scale/`](docs/scale/index.md).

<br>

## ✦ Documentation

| Where | What it is |
|---|---|
| **[`AGENTS.md`](AGENTS.md)** | What a coding agent reads first: the five rules that cost the most when broken, then a pointer to the task router. `CLAUDE.md` imports it. |
| **[`docs/ai/`](docs/ai/index.md)** | Everything written for agents. The index is a task router; [`rules/`](docs/ai/rules/index.md) is the rulebook (fourteen files, ~11,100 tokens), and [`skills/`](docs/ai/skills/add-slice.md) holds the run books. |
| **[`docs/setup/`](docs/setup/00-README.md)** | The build order, walked once. Thirty-one documents from an empty directory to a running app. |
| **[`docs/opinions/`](docs/opinions/index.md)** | The reference: what to call a thing, where to put it, and which store owns it. |
| **`packages/*/docs/`** | One reference set per package: what it is for, and why each export is shaped the way it is. |
| **[`docs/infra/`](docs/infra/index.md)** | The running stack: what each container is for, and what to check when it is wrong. |
| **[`docs/scale/`](docs/scale/index.md)** | What lite removed, when a project needs each piece back, and how to port it from the big kit. |
| **[`docs/plans/`](docs/plans/index.md)** | The backlog of what is left, the handoff, and every finished plan in `archive/`. |

<br>

<div align="center">
<sub>Built to carry weight. ⚙️</sub>
</div>
