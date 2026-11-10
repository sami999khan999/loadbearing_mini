import type { ApiClient } from "@loadbearing/api-client";
import type { AssistantMessageDto } from "@loadbearing/contracts";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssistantThreadPanel } from "../../src/assistant/assistant-thread.panel.js";
import { capabilitiesWith, renderWithFakes, TEST_USER } from "../support/render-with-fakes.js";

const THREAD = "00000000-0000-7000-8000-0000000000a1";
const ANSWER = "00000000-0000-7000-8000-0000000000b2";
const at = new Date("2026-10-18T12:00:00.000Z");

const question: AssistantMessageDto = {
  id: "00000000-0000-7000-8000-0000000000b1",
  threadId: THREAD,
  role: "user",
  content: "How do keys rotate?",
  status: "complete",
  sources: [],
  model: null,
  createdAt: at,
  completedAt: at,
};

const answer = (over: Partial<AssistantMessageDto> = {}): AssistantMessageDto => ({
  ...question,
  id: ANSWER,
  role: "assistant",
  content: "Every quarter.",
  model: "scripted",
  ...over,
});

const clientFor = (
  messages: readonly AssistantMessageDto[],
  stream?: () => AsyncIterable<unknown>,
) => {
  const cancel = vi.fn((_input: unknown) => Promise.resolve({ ok: true }));
  const client = {
    assistant: {
      get: () =>
        Promise.resolve({
          thread: { id: THREAD, title: "Keys", createdAt: at, updatedAt: at },
          messages,
        }),
      cancel,
    },
    realtime: { assistant: () => Promise.resolve(stream?.() ?? (async function* () {})()) },
  } as unknown as ApiClient;
  return { client, cancel };
};

const render = (client: ApiClient) =>
  renderWithFakes(
    <AssistantThreadPanel threadId={THREAD} sourceHref={(path) => `/doc/${path}`} />,
    capabilitiesWith(["ai.assistant.use"]),
    TEST_USER,
    ["assistant"],
    client,
  );

describe("AssistantThreadPanel", () => {
  it("links a source the reader may still open, and names one they lost without a link", async () => {
    const { client } = clientFor([
      question,
      answer({
        sources: [
          { kind: "doc", id: "p1", title: "Keys — Rotation", path: "ops/keys", available: true },
          { kind: "doc", id: "p2", title: "Secret runbook", path: "secret/run", available: false },
        ],
      }),
    ]);
    await render(client);

    await waitFor(() => expect(screen.getByText("Every quarter.")).toBeDefined());
    expect(screen.getByRole("link", { name: "Keys — Rotation" }).getAttribute("href")).toBe(
      "/doc/ops/keys",
    );
    expect(screen.queryByRole("link", { name: /Secret runbook/ })).toBeNull();
    expect(screen.getByText(/Secret runbook — No longer available to you/)).toBeDefined();
  });

  it("streams a pending answer in place and stops it on request", async () => {
    const { client, cancel } = clientFor(
      [question, answer({ content: "", status: "pending", completedAt: null })],
      async function* () {
        yield { kind: "text", id: "1-1", text: "Rotate " };
        yield { kind: "text", id: "1-2", text: "quarterly." };
        // Held open, as an answer still being written is.
        await new Promise(() => undefined);
      },
    );
    await render(client);

    await waitFor(() => expect(screen.getByText("Rotate quarterly.")).toBeDefined());
    expect(screen.getByText("Writing…")).toBeDefined();
    // The next question waits until this answer is done.
    expect(screen.getByRole("button", { name: "Ask" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    expect(cancel.mock.calls[0]?.[0]).toEqual({ threadId: THREAD, messageId: ANSWER });
  });

  it("says when an answer failed rather than leaving it blank", async () => {
    const { client } = clientFor([question, answer({ content: "", status: "failed" })]);
    await render(client);
    await waitFor(() =>
      expect(screen.getByText("This answer could not be written.")).toBeDefined(),
    );
  });
});
