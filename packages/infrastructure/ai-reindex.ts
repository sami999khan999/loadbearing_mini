// After `EMBEDDING_PROVIDER` or `EMBEDDING_MODEL` changes. Queues one `reembed` job per
// organization on the embedding queue; `--docs` queues `doc-reindex`, every published page.

import { BullMqQueuePublisher } from "./src/bullmq/index.js";
import { QueueName, Redis, sql } from "./src/import.js";
import { Database } from "./src/pg/primitive/index.js";

// The backfill for pages published before `DC.2`; a publish after it indexes itself.
const job = process.argv.includes("--docs") ? "doc-reindex" : "reembed";

const databaseUrl = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");
const queueUrl = process.env.REDIS_QUEUE_URL;
if (!queueUrl) throw new Error("REDIS_QUEUE_URL is required.");

// The catalog, which names every organization whichever node holds its chunks: the job
// is placed on the tenant's node by the consumer, not here.
const catalog = new Database({ url: databaseUrl });
const connection = new Redis(queueUrl, { maxRetriesPerRequest: null });
// The app's own publisher, so these jobs get its attempts, backoff and retention: a bare
// `add` ran each once, and a provider blip left that tenant's chunks stale for good.
const queue = new BullMqQueuePublisher(connection);

try {
  const rows = await catalog.client.execute<{ id: string }>(sql`select id from organizations`);

  // Deduped while waiting or running, so running this twice before the worker drains it
  // queues each tenant once. Never a job id: a failed job kept it, and a rerun was a no-op.
  for (const row of rows.rows) {
    await queue.publish(
      QueueName.EMBEDDING,
      { organizationId: row.id },
      { name: job, inFlightId: `${job}_${row.id}` },
    );
  }
  console.log(`queued ${job} for ${rows.rows.length} organization(s)`);
} finally {
  await queue.close();
  connection.disconnect();
  await catalog.close();
}
