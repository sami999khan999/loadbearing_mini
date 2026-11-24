// What `pnpm ops queue-status`, `ops queue-pause` and `ops queue-resume` run. The pause is BullMQ's
// global one, kept in the queue's own keys: every worker obeys it and it survives restarts.

import { BullMqQueueControlGateway } from "../src/bullmq/index.js";
import { QueueName, Redis } from "../src/import.js";

const COMMANDS = ["status", "pause", "resume"] as const;
const QUEUES: readonly string[] = QueueName.ALL;

const [command, target] = process.argv.slice(2);
if (!command || !(COMMANDS as readonly string[]).includes(command)) {
  throw new Error(`usage: pnpm queue:${COMMANDS.join("|")} [${QUEUES.join("|")}|all]`);
}

// `status` reads every queue by default; a pause must name what it stops, so `all` is
// typed on purpose rather than reached by forgetting the argument.
const named = target ?? (command === "status" ? "all" : undefined);
if (!named || (named !== "all" && !QUEUES.includes(named))) {
  throw new Error(`usage: pnpm queue:${command} <${QUEUES.join("|")}|all>`);
}
const queues = named === "all" ? QUEUES : [named];

const url = process.env.REDIS_QUEUE_URL;
if (!url) throw new Error("REDIS_QUEUE_URL is required.");

const connection = new Redis(url, { maxRetriesPerRequest: null });
const control = new BullMqQueueControlGateway(connection);

try {
  for (const queue of queues) {
    if (command === "pause") await control.pause(queue);
    if (command === "resume") await control.resume(queue);
  }

  console.table(
    (await control.counts(queues)).map((row) => ({
      queue: row.queue,
      state: row.paused ? "paused" : "running",
      waiting: row.waiting,
      active: row.active,
      delayed: row.delayed,
      failed: row.failed,
    })),
  );
} finally {
  await control.close();
  connection.disconnect();
}
