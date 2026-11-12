import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  AssistantMutations,
  Button,
  Callout,
  Textarea,
  useApiClient,
  useState,
} from "../import.js";

export interface AssistantQuestionFormProps {
  // Absent starts a new thread, titled from the question.
  readonly threadId?: string;
  // While an answer is still being written in this thread, so a second cannot queue behind it.
  readonly busy?: boolean;
  readonly onSent?: (sent: { readonly threadId: string; readonly messageId: string }) => void;
}

export function AssistantQuestionForm({
  threadId,
  busy = false,
  onSent,
}: AssistantQuestionFormProps) {
  const { t } = useMessages("assistant");
  const describe = useErrorMessage();
  const client = useApiClient();
  const [question, setQuestion] = useState("");
  const send = AssistantMutations.useSend(client);
  const blocked = busy || send.isPending || question.trim().length === 0;

  const submit = () => {
    const trimmed = question.trim();
    if (blocked) return;
    send.mutate(
      { question: trimmed, ...(threadId ? { threadId } : {}) },
      {
        onSuccess: (sent) => {
          setQuestion("");
          onSent?.(sent);
        },
      },
    );
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-2"
    >
      <Textarea
        rows={3}
        value={question}
        aria-label={t("assistant.ask.placeholder")}
        placeholder={t("assistant.ask.placeholder")}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          // Enter asks, Shift+Enter breaks the line; never while an IME is composing a word.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          submit();
        }}
      />
      <small className="text-fg-muted">{t("assistant.ask.hint")}</small>
      <div>
        <Button type="submit" variant="primary" disabled={blocked}>
          {t("assistant.ask.submit")}
        </Button>
      </div>
      {send.isError ? (
        <Callout tone="danger">
          {describe(send.error)?.message ?? t("assistant.ask.failed")}
        </Callout>
      ) : null}
    </form>
  );
}
