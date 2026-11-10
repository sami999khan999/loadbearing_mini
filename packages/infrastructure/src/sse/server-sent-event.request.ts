import {
  type CancellationSignal,
  type Logger,
  RateLimitedError,
  UnavailableError,
} from "../import.js";
import { type ServerSentEvent, ServerSentEventReader } from "./server-sent-event.reader.js";
import { StreamWatch } from "./stream-watch.js";

export interface ServerSentEventRequestOptions {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
  // `openai.chat`, `gemini.chat`: what a failure names as its dependency.
  readonly dependency: string;
  readonly model: string;
  readonly firstByteMs: number;
  readonly idleMs: number;
  readonly signal?: CancellationSignal;
  readonly logger?: Logger;
}

// A streamed POST, as both chat providers take one. A 429 is `RATE_LIMITED`; any other
// failure, a timeout included, is `UNAVAILABLE`. A cancel by the caller ends it quietly.
export class ServerSentEventRequest {
  private constructor() {}

  public static async *events(
    options: ServerSentEventRequestOptions,
  ): AsyncGenerator<ServerSentEvent> {
    const watch = new StreamWatch(options.signal);
    watch.arm(options.firstByteMs);

    try {
      let response: Response;
      try {
        response = await fetch(options.url, {
          method: "POST",
          headers: { "content-type": "application/json", ...options.headers },
          body: JSON.stringify(options.body),
          signal: watch.signal,
        });
      } catch {
        if (watch.cancelled) return;
        ServerSentEventRequest.fail(options, 0);
        throw new UnavailableError(options.dependency);
      }

      if (!response.ok || !response.body) {
        ServerSentEventRequest.fail(options, response.status);
        // The body is the vendor's reason, for the log at most: never the wire.
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 429) throw new RateLimitedError(options.dependency);
        throw new UnavailableError(options.dependency, response.status);
      }

      const body = response.body as unknown as AsyncIterable<Uint8Array>;
      try {
        for await (const event of ServerSentEventReader.read(body)) {
          watch.arm(options.idleMs);
          yield event;
        }
      } catch {
        if (watch.cancelled) return;
        ServerSentEventRequest.fail(options, response.status);
        throw new UnavailableError(options.dependency, response.status);
      }
    } finally {
      watch.dispose();
    }
  }

  private static fail(options: ServerSentEventRequestOptions, status: number): void {
    options.logger?.emit("assistant.request.failed", {
      dependency: options.dependency,
      model: options.model,
      status,
    });
  }
}
