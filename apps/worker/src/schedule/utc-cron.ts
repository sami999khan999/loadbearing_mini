import type { Queue } from "../import.js";

// BullMQ reads a cron pattern in the process's own timezone unless told otherwise. Every
// pattern here is written in UTC, and the digest's day is a UTC day, so each says so.
export class UtcCron {
  public static readonly TZ = "UTC";

  // The `tz` is part of a repeatable entry's key, so adding it alone would leave the entry
  // registered without it running beside the new one. This removes that older entry first.
  public static async dropLocal(
    queue: Queue,
    name: string,
    pattern: string,
    jobId: string,
  ): Promise<void> {
    await queue.removeRepeatable(name, { pattern }, jobId);
  }
}
