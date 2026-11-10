import type {
  ApiClient,
  AssistantAnswerInput,
  RenameAssistantThreadInput,
  SendAssistantQuestionInput,
} from "../import.js";
import { QueryKeys } from "../key/index.js";
import { useAppMutation } from "../runtime/index.js";

type Sent = Awaited<ReturnType<ApiClient["assistant"]["send"]>>;
type Thread = Awaited<ReturnType<ApiClient["assistant"]["rename"]>>;

// No optimism anywhere: the question and its pending answer are two rows the server
// writes together, and refetching the thread draws both with their real ids.
export class AssistantMutations {
  private constructor() {}

  public static useSend(client: ApiClient) {
    return useAppMutation<Sent, SendAssistantQuestionInput>({
      mutationFn: (input) => client.assistant.send(input),
      invalidates: [QueryKeys.assistant.all()],
    });
  }

  // The thread is not invalidated: the answer's stream ends with `done`, and that refetches.
  public static useCancel(client: ApiClient) {
    return useAppMutation<{ ok: true }, AssistantAnswerInput>({
      mutationFn: (input) => client.assistant.cancel(input),
    });
  }

  public static useRename(client: ApiClient) {
    return useAppMutation<Thread, RenameAssistantThreadInput>({
      mutationFn: (input) => client.assistant.rename(input),
      invalidates: [QueryKeys.assistant.all()],
    });
  }

  public static useDelete(client: ApiClient) {
    return useAppMutation<{ ok: true }, { readonly threadId: string }>({
      mutationFn: (input) => client.assistant.remove(input),
      invalidates: [QueryKeys.assistant.lists()],
    });
  }
}
