import { describe, expect, it } from "vitest";
import { ServerSentEventReader } from "../../src/sse/index.js";

// Bytes as a network delivers them: split wherever the chunk boundaries fall.
async function* chunks(text: string, size: number): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  for (let at = 0; at < bytes.length; at += size) yield bytes.slice(at, at + size);
}

const read = async (text: string, size = 3) => {
  const out = [];
  for await (const event of ServerSentEventReader.read(chunks(text, size))) out.push(event);
  return out;
};

describe("ServerSentEventReader", () => {
  it("dispatches on a blank line, whatever the chunk boundaries", async () => {
    expect(await read('data: {"a":1}\n\ndata: {"b":2}\n\n', 2)).toEqual([
      { event: null, data: '{"a":1}' },
      { event: null, data: '{"b":2}' },
    ]);
  });

  it("joins data lines, reads the event field, and skips comments", async () => {
    expect(await read(": keep-alive\nevent: delta\ndata: one\ndata: two\n\n")).toEqual([
      { event: "delta", data: "one\ntwo" },
    ]);
  });

  it("reads \\r\\n line ends, and a last event with no blank line after it", async () => {
    expect(await read("data: first\r\n\r\ndata: last")).toEqual([
      { event: null, data: "first" },
      { event: null, data: "last" },
    ]);
  });

  // A multi-byte character split across two chunks must not become two broken halves.
  it("decodes a character split across chunks", async () => {
    expect(await read("data: café ☕\n\n", 1)).toEqual([{ event: null, data: "café ☕" }]);
  });
});
