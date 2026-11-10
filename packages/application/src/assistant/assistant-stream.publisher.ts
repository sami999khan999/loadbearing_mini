import type { AssistantFrame } from "../import.js";

// A frame before the log gives it its id.
export type AssistantFrameBody =
  | Omit<Extract<AssistantFrame, { kind: "text" }>, "id">
  | Omit<Extract<AssistantFrame, { kind: "done" }>, "id">;

// One answer's frames, complete and in order, unlike realtime's lossy fan-out: each is
// logged before it is announced. See packages/application/docs/reference/assistant.md.
export abstract class AssistantStreamPublisher {
  public abstract publish(messageId: string, frame: AssistantFrameBody): Promise<void>;

  // Set by the web process and read by the worker between chunks, so a stop reaches the
  // generation wherever it runs. It expires with the answer's log.
  public abstract requestCancel(messageId: string): Promise<void>;

  public abstract isCancelRequested(messageId: string): Promise<boolean>;
}
