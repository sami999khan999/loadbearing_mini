import { type PushPayload, PushSender, type PushTarget } from "../import.js";

// Every push a spec caused, in order. `gone` holds the endpoints the service has retired.
export class RecordingPushSender extends PushSender {
  public readonly sent: { readonly target: PushTarget; readonly payload: PushPayload }[] = [];
  public readonly gone = new Set<string>();

  public override send(target: PushTarget, payload: PushPayload): Promise<"sent" | "gone"> {
    if (this.gone.has(target.endpoint)) return Promise.resolve("gone");
    this.sent.push({ target, payload });
    return Promise.resolve("sent");
  }
}
