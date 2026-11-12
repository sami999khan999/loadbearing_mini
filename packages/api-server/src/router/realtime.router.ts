import {
  type Container,
  RealtimeChannels,
  type RealtimeMessage,
  withEventMeta,
} from "../import.js";
import { authed } from "./base.js";
import { HeldStreamCheck } from "./held-stream.check.js";
import { StreamRevalidation } from "./stream-revalidation.js";

// Reconnect delay the client honours through `ClientRetryPlugin`, whose `retryDelay`
// default reads exactly this off the last frame.
const RETRY_MS = 2_000;

// How often an open stream asks again whether its principal may still hold it. A minute
// of frames after a removal, where there were thirty (`CR.4`).
const REVALIDATE_MS = 60_000;

// One registry a container, which is one a process: every open stream of either kind
// registers into it, and its single interval asks once per tenant (`RV.4`).
const registries = new WeakMap<Container, StreamRevalidation>();

function revalidationOf(container: Container): StreamRevalidation {
  const existing = registries.get(container);
  if (existing) return existing;

  const created = new StreamRevalidation(REVALIDATE_MS, (organizationId, held) =>
    HeldStreamCheck.answer(container, organizationId, held),
  );
  registries.set(container, created);
  return created;
}

// Both streams, and nothing else. One namespace is one process: `apps/realtime` mounts this
// router and the browser sends every `realtime.*` path to it.
export class RealtimeRouter {
  private constructor() {}

  // A typing frame carries no SSE id, so it never becomes the point a client resumes from:
  // it is never logged, and a resume from it could only ever be a resync.
  private static framed(message: RealtimeMessage) {
    return message.kind === "typing"
      ? withEventMeta(message, { retry: RETRY_MS })
      : withEventMeta(message, { id: message.id, retry: RETRY_MS });
  }

  // The channel is built from the principal, never from input. That is the whole of the
  // authorisation: you cannot ask for a stream that is not yours.
  public static readonly stream = authed.realtime.stream.handler(async function* ({
    context,
    signal,
    lastEventId,
  }) {
    const channel = RealtimeChannels.user(
      context.principal.organizationId,
      context.principal.userId,
    );

    const startedAt = Date.now();
    let frames = 0;
    context.log.emit("realtime.stream.opened", { resumed: lastEventId !== undefined });
    // A deactivated member's stream ends; the reopen is refused, and the client stops.
    const watched = revalidationOf(context.container).watch(signal as AbortSignal, {
      principal: context.principal,
    });

    try {
      for await (const message of context.container.realtimeSubscriber.subscribe(
        [channel],
        watched.signal,
        // The resume point, when there is one: the subscriber replays what came after it,
        // or yields a `resync` when its log no longer reaches back that far (`26.5`).
        { owner: channel, ...(lastEventId === undefined ? {} : { after: lastEventId }) },
      )) {
        frames += 1;
        yield RealtimeRouter.framed(message);
      }
    } finally {
      watched.stop();
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  // The second stream, and the only one that takes an input. Membership is asserted
  // **before** the subscription, so a stranger never reaches Redis — and every minute after.
  public static readonly conversation = authed.realtime.conversation.handler(async function* ({
    input,
    context,
    signal,
    lastEventId,
  }) {
    await context.container.messaging.watch.execute(context.principal, input.conversationId);

    const channel = RealtimeChannels.conversation(
      context.principal.organizationId,
      input.conversationId,
    );

    const startedAt = Date.now();
    let frames = 0;
    context.log.emit("realtime.stream.opened", { resumed: lastEventId !== undefined });

    // Removed, left, deactivated, or the read revoked: the stream ends and the reopen is
    // refused. Re-read, never the principal captured at open, which would keep all four.
    const watched = revalidationOf(context.container).watch(signal as AbortSignal, {
      principal: context.principal,
      conversationId: input.conversationId,
    });

    try {
      for await (const message of context.container.realtimeSubscriber.subscribe(
        [channel],
        watched.signal,
        // The person's cap, not the room's: every stream a tab opens counts against it.
        {
          owner: RealtimeChannels.user(context.principal.organizationId, context.principal.userId),
          ...(lastEventId === undefined ? {} : { after: lastEventId }),
        },
      )) {
        frames += 1;
        yield RealtimeRouter.framed(message);
      }
    } finally {
      watched.stop();
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  // One answer while it streams, from its own log. Authorship is asserted before the log
  // is opened, and the stream ends with the answer's `done` frame rather than on a timer.
  public static readonly assistant = authed.realtime.assistant.handler(async function* ({
    input,
    context,
    signal,
    lastEventId,
  }) {
    const startedAt = Date.now();
    let frames = 0;
    context.log.emit("realtime.stream.opened", { resumed: lastEventId !== undefined });
    // Only the drain and the client's own close end it early; it is minutes long at most,
    // so the held-stream check that guards the hour-long streams would add nothing here.
    const ended = signal ?? new AbortController().signal;

    try {
      for await (const frame of context.container.assistant.stream.execute(
        context.principal,
        input,
        ended,
        lastEventId,
      )) {
        frames += 1;
        yield withEventMeta(frame, { id: frame.id, retry: RETRY_MS });
      }
    } finally {
      context.log.emit("realtime.stream.closed", { durationMs: Date.now() - startedAt, frames });
    }
  });

  public static readonly all = {
    stream: RealtimeRouter.stream,
    conversation: RealtimeRouter.conversation,
    assistant: RealtimeRouter.assistant,
  };
}
