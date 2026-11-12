import {
  type ApiClient,
  type AssistantFrame,
  type AssistantSourceDto,
  type AssistantStatus,
  useEffect,
  useQueryClient,
  useRef,
  useState,
} from "../import.js";
import { QueryKeys } from "../key/index.js";
import { RealtimeStream } from "../realtime/index.js";

export interface AssistantStreamState {
  // Everything streamed so far, in order. On a reconnect the log replays only what came
  // after the last frame, so this grows and is never redrawn from nothing.
  readonly text: string;
  // Null while the answer is still being written.
  readonly status: Exclude<AssistantStatus, "pending"> | null;
  readonly sources: readonly AssistantSourceDto[];
  readonly connected: boolean;
}

const IDLE: AssistantStreamState = { text: "", status: null, sources: [], connected: false };

// One answer while it streams. Opened for the thread's pending answer only, and ended by
// its `done` frame, which refetches the thread so the saved row replaces the streamed one.
export function useAssistantStream(
  client: ApiClient,
  threadId: string,
  messageId: string | null,
): AssistantStreamState {
  const queryClient = useQueryClient();
  const cache = useRef(queryClient);
  cache.current = queryClient;
  const [state, setState] = useState<AssistantStreamState>(IDLE);

  useEffect(() => {
    setState(IDLE);
    if (typeof window === "undefined" || !messageId) return;

    const controller = new AbortController();
    const onFrame = (frame: AssistantFrame) => {
      if (controller.signal.aborted) return;
      if (frame.kind === "text") {
        setState((current) => ({ ...current, text: current.text + frame.text }));
        return;
      }
      setState((current) => ({ ...current, status: frame.status, sources: frame.sources }));
      void cache.current.invalidateQueries({ queryKey: QueryKeys.assistant.get(threadId) });
      void cache.current.invalidateQueries({ queryKey: QueryKeys.assistant.lists() });
    };

    void RealtimeStream.run<AssistantFrame>({
      open: (signal, lastEventId) =>
        client.realtime.assistant({ threadId, messageId }, { signal, lastEventId }),
      onConnected: (connected) => {
        if (!controller.signal.aborted) setState((current) => ({ ...current, connected }));
      },
      onFrame,
      // The answer's log keeps every frame, so any is a place to resume from.
      resumesFrom: () => true,
      endsWith: (frame) => frame.kind === "done",
      signal: controller.signal,
    });

    return () => controller.abort();
  }, [client, threadId, messageId]);

  return state;
}
