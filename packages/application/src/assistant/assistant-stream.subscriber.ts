import type { AssistantFrame } from "../import.js";
import type { CancellationSignal } from "../primitive/index.js";

// What the answer's log holds after `after` (all of it on a first open), then each frame
// as it lands. It ends after `done`, when `signal` aborts, or once nothing arrives in time.
export abstract class AssistantStreamSubscriber {
  public abstract subscribe(
    messageId: string,
    signal: CancellationSignal,
    after?: string,
  ): AsyncIterable<AssistantFrame>;
}
