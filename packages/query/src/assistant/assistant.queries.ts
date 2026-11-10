import type { ApiClient, ListAssistantThreadsInput } from "../import.js";
import { infiniteQueryOptions, queryOptions } from "../import.js";
import { QueryKeys } from "../key/index.js";

type ThreadPage = Awaited<ReturnType<ApiClient["assistant"]["list"]>>;

export class AssistantQueries {
  private constructor() {}

  public static threads(client: ApiClient, params: Omit<ListAssistantThreadsInput, "cursor">) {
    return infiniteQueryOptions({
      queryKey: QueryKeys.assistant.list(params),
      queryFn: ({ pageParam, signal }) =>
        client.assistant.list(
          { ...params, ...(pageParam ? { cursor: pageParam } : {}) },
          { signal },
        ),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (last: ThreadPage) => last.nextCursor ?? undefined,
      staleTime: 30_000,
    });
  }

  // Zero, because an answer settling is what changes it, and `assistant.changed` or the
  // answer's own stream says so the moment it does.
  public static thread(client: ApiClient, threadId: string) {
    return queryOptions({
      queryKey: QueryKeys.assistant.get(threadId),
      queryFn: ({ signal }) => client.assistant.get({ threadId }, { signal }),
      staleTime: 0,
    });
  }

  // A minute: the meter moves as answers settle, and nobody watches it tick.
  public static usage(client: ApiClient) {
    return queryOptions({
      queryKey: QueryKeys.assistant.usage(),
      queryFn: ({ signal }) => client.assistant.usage(undefined, { signal }),
      staleTime: 60_000,
    });
  }
}
