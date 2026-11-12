import { AssistantContract, type AssistantFrame, type Redis } from "../import.js";

// One Redis Stream per answer, its pub/sub channel and its stop flag, all hash-tagged on the
// answer so a move to Redis Cluster keeps them on one slot. See docs/reference/assistant.md.
export class AssistantLog {
  // Longer than any answer takes, so a reload mid-answer always finds the whole log.
  public static readonly TTL_SECONDS = 600;

  private constructor() {}

  public static keyOf(messageId: string): string {
    return `assistant:{${messageId}}`;
  }

  // Unprefixed, because pub/sub channels are not keys and ioredis prefixes only keys.
  public static channelOf(messageId: string): string {
    return `assistant:{${messageId}}`;
  }

  public static cancelKeyOf(messageId: string): string {
    return `assistant:{${messageId}}:cancel`;
  }

  // Strictly after `after`, never the whole log: `(` makes the range exclusive, so a resume
  // reads only what it missed (`RV.3`). Absent `after` is a first open, which reads it all.
  public static async since(
    redis: Redis,
    messageId: string,
    after: string | undefined,
  ): Promise<readonly AssistantFrame[]> {
    const start = after === undefined ? "-" : `(${after}`;
    const entries = await redis.xrange(AssistantLog.keyOf(messageId), start, "+");
    const frames: AssistantFrame[] = [];
    for (const [id, fields] of entries) {
      const frame = AssistantLog.parse(id, fields[1]);
      if (frame) frames.push(frame);
    }
    return frames;
  }

  // A frame's body is stored without its id, which is the entry's own.
  public static parse(id: string, payload: string | undefined): AssistantFrame | null {
    try {
      const parsed = AssistantContract.frame.safeParse({ ...JSON.parse(payload ?? ""), id });
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  // Stream ids are `<ms>-<seq>`, ordered by both numbers; a string compare is wrong once
  // one millisecond count has more digits than the other.
  public static isAfter(id: string, than: string): boolean {
    const [ms = 0, seq = 0] = id.split("-").map(Number);
    const [thanMs = 0, thanSeq = 0] = than.split("-").map(Number);
    return ms > thanMs || (ms === thanMs && seq > thanSeq);
  }
}
