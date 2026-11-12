import { AssistantContract } from "../assistant/index.js";
import { eventIterator, oc } from "../import.js";
import { ConversationContract } from "../messaging/index.js";
import { RealtimeContract } from "./realtime.contract.js";

export class RealtimeProcedures {
  private constructor() {}

  // The `route` is OpenAPI metadata, like every sibling's. `RPCHandler` — the only
  // handler this repo mounts — dispatches on the procedure path and never reads it.
  public static readonly stream = oc
    .route({ method: "GET", path: "/realtime/stream" })
    .output(eventIterator(RealtimeContract.message));

  // One answer while it streams, from its own log rather than a channel's. It ends at the
  // answer's `done` frame, so it is open only while something is being generated.
  public static readonly assistant = oc
    .route({ method: "GET", path: "/realtime/assistant" })
    .input(AssistantContract.answer)
    .output(eventIterator(AssistantContract.frame));

  // The second stream. Opened only while a conversation is on screen, which is what
  // keeps a tab to two connections rather than one per conversation it has ever seen.
  public static readonly conversation = oc
    .route({ method: "GET", path: "/realtime/conversation" })
    .input(ConversationContract.get)
    .output(eventIterator(RealtimeContract.message));

  public static readonly all = {
    stream: RealtimeProcedures.stream,
    assistant: RealtimeProcedures.assistant,

    conversation: RealtimeProcedures.conversation,
  } as const;
}
