import { type AssistantFrameBody, AssistantStreamPublisher, type Redis } from "../import.js";
import { AssistantLog } from "./assistant-log.js";

// Append, expire and announce in one script, so the announcement carries the entry's id:
// a reader that heard a frame live and read it from the log drops one copy by that id.
const APPEND = `
local id = redis.call('XADD', KEYS[1], '*', 'f', ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[2])
redis.call('PUBLISH', ARGV[3], id .. '|' .. ARGV[1])
return id
`;

// Unlike `RedisRealtimePublisher`, a failure throws: a lost frame is a hole in an answer,
// and the generation that sent it is the one place that can stop and say so.
export class RedisAssistantStreamPublisher extends AssistantStreamPublisher {
  public constructor(private readonly redis: Redis) {
    super();
  }

  public override async publish(messageId: string, frame: AssistantFrameBody): Promise<void> {
    await this.redis.eval(
      APPEND,
      1,
      AssistantLog.keyOf(messageId),
      JSON.stringify(frame),
      AssistantLog.TTL_SECONDS,
      AssistantLog.channelOf(messageId),
    );
  }

  public override async requestCancel(messageId: string): Promise<void> {
    await this.redis.set(AssistantLog.cancelKeyOf(messageId), "1", "EX", AssistantLog.TTL_SECONDS);
  }

  public override async isCancelRequested(messageId: string): Promise<boolean> {
    return (await this.redis.exists(AssistantLog.cancelKeyOf(messageId))) === 1;
  }
}
