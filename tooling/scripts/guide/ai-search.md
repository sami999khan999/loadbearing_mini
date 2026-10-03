## What it is

**Documents** (`/documents`) lets you paste text to store it, then search everything stored, by
meaning when an AI provider is set up, or by words when not.

## How it works

:::steps
### You paste text

The worker splits it into pieces of about 1,500 characters.

### Each piece gets a fingerprint of its meaning

With an AI provider set up, the provider turns each piece into a list of numbers (an embedding)
that captures what it is about.

### Search compares meanings

Your question gets a fingerprint too, and the closest pieces come back, even when they use
different words.
:::

## The three modes

The server setting `EMBEDDING_PROVIDER` chooses:

| Mode | Search by | Needs |
|---|---|---|
| `none` (the default) | matching words | nothing; no outside calls are made |
| `openai` | meaning | an API key in `EMBEDDING_API_KEY` |
| `gemini` | meaning | an API key in `EMBEDDING_API_KEY` |

## Step by step

:::steps
### Index a text

Under **Index text**, paste into **Text** (up to 100,000 characters) and press **Index**. You see
"Queued as …. Search for it in a moment."

### Wait a moment

Indexing runs in the worker.

### Search

Under **Search**, type in **What are you looking for?** and press **Search**. The ten best matches
come back, each with where it came from and a score.
:::

## Who can use it

`ai.embedding.read` to search and `ai.embedding.write` to index. By default only the **Owner** role
has them.

## Good to know

> [!WARNING]
> **After switching provider or model**, older texts are not found until you run
> `pnpm ai:reindex`. Fingerprints from two different models cannot be compared, so the app never
> mixes them.

- Every search is recorded in the organization's audit history.
