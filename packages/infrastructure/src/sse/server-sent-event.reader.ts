// One dispatched event: `event` is the field's value or null, `data` its data lines joined
// by newlines, as the spec defines.
export interface ServerSentEvent {
  readonly event: string | null;
  readonly data: string;
}

// The `text/event-stream` format over a response body, as both chat providers stream it.
// A comment line and a field this does not read are skipped, never an error.
export class ServerSentEventReader {
  private constructor() {}

  public static async *read(body: AsyncIterable<Uint8Array>): AsyncGenerator<ServerSentEvent> {
    const decoder = new TextDecoder();
    let buffer = "";
    let event: string | null = null;
    let data: string[] = [];

    const dispatch = (): ServerSentEvent | null => {
      const ready = data.length > 0 ? { event, data: data.join("\n") } : null;
      event = null;
      data = [];
      return ready;
    };

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });

      for (;;) {
        const end = buffer.indexOf("\n");
        if (end < 0) break;
        // `\r\n` and `\n` both end a line; a lone `\r` inside a value is kept.
        const line = buffer.slice(0, end).replace(/\r$/, "");
        buffer = buffer.slice(end + 1);

        if (line === "") {
          const ready = dispatch();
          if (ready) yield ready;
          continue;
        }
        if (line.startsWith(":")) continue;

        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /, "");
        if (field === "data") data.push(value);
        else if (field === "event") event = value;
      }
    }

    // A stream that ends without its final blank line still delivers the last event.
    buffer += decoder.decode();
    if (buffer.startsWith("data:")) data.push(buffer.slice(5).replace(/^ /, ""));
    const ready = dispatch();
    if (ready) yield ready;
  }
}
