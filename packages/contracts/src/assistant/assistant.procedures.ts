import { oc } from "../import.js";
import { Envelope } from "../primitive/index.js";
import { AssistantContract } from "./assistant.contract.js";

// The answer's stream is not here: it is `realtime.assistant`, because every `realtime.*`
// path is served by `apps/realtime` and nothing else is.
export class AssistantProcedures {
  private constructor() {}

  public static readonly list = oc
    .route({ method: "GET", path: "/assistant/threads" })
    .input(AssistantContract.listQuery)
    .output(AssistantContract.page);

  public static readonly get = oc
    .route({ method: "GET", path: "/assistant/threads/{threadId}" })
    .input(AssistantContract.get)
    .output(AssistantContract.detail);

  public static readonly send = oc
    .route({ method: "POST", path: "/assistant/messages" })
    .input(AssistantContract.send)
    .output(AssistantContract.sent);

  public static readonly cancel = oc
    .route({ method: "POST", path: "/assistant/messages/{messageId}/cancel" })
    .input(AssistantContract.answer)
    .output(Envelope.acknowledged);

  public static readonly rename = oc
    .route({ method: "PUT", path: "/assistant/threads/{threadId}" })
    .input(AssistantContract.rename)
    .output(AssistantContract.thread);

  public static readonly remove = oc
    .route({ method: "DELETE", path: "/assistant/threads/{threadId}" })
    .input(AssistantContract.get)
    .output(Envelope.acknowledged);

  public static readonly usage = oc
    .route({ method: "GET", path: "/assistant/usage" })
    .output(AssistantContract.usage);

  public static readonly all = {
    list: AssistantProcedures.list,
    get: AssistantProcedures.get,
    send: AssistantProcedures.send,
    cancel: AssistantProcedures.cancel,
    rename: AssistantProcedures.rename,
    remove: AssistantProcedures.remove,
    usage: AssistantProcedures.usage,
  } as const;
}
