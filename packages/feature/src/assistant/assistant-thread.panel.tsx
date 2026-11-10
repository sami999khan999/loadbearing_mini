import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  AlertDialog,
  type AssistantMessageDto,
  AssistantMutations,
  AssistantQueries,
  type AssistantSourceDto,
  Button,
  Callout,
  DataTable,
  Dialog,
  Field,
  Input,
  StatusBadge,
  useApiClient,
  useAppQuery,
  useAssistantStream,
  useState,
} from "../import.js";
import { AssistantQuestionForm } from "./assistant-question.form.js";

export interface AssistantThreadPanelProps {
  readonly threadId: string;
  // Where a doc source opens, from its `<space>/<path>`. `feature` names no route itself.
  readonly sourceHref: (path: string) => string;
  readonly onDeleted?: () => void;
}

// One thread: its turns, the answer still being written streamed in place, and the box
// to ask the next question. A reload mid-answer reopens the stream where it was.
export function AssistantThreadPanel({
  threadId,
  sourceHref,
  onDeleted,
}: AssistantThreadPanelProps) {
  const { t } = useMessages("assistant");
  const shell = useMessages("common");
  const describe = useErrorMessage();
  const client = useApiClient();

  const thread = useAppQuery(AssistantQueries.thread(client, threadId));
  const messages = thread.data?.messages ?? [];
  const last = messages.at(-1);
  const pending = last?.role === "assistant" && last.status === "pending" ? last : null;
  const stream = useAssistantStream(client, threadId, pending?.id ?? null);
  const cancel = AssistantMutations.useCancel(client);
  const rename = AssistantMutations.useRename(client);
  const remove = AssistantMutations.useDelete(client);

  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (thread.isPending) return <DataTable.Skeleton columns={1} rows={4} />;
  if (thread.isError || !thread.data) {
    return (
      <Callout tone="danger">
        {describe(thread.error)?.message ?? t("assistant.thread.error")}
      </Callout>
    );
  }
  const { title } = thread.data.thread;

  return (
    <section aria-labelledby="assistant-thread-title" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="assistant-thread-title">{title}</h2>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setRenaming(title)}>
            {t("assistant.thread.rename")}
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(true)}>
            {t("assistant.thread.delete")}
          </Button>
        </div>
      </header>

      <ol className="flex flex-col gap-4">
        {messages.map((message) => (
          <li key={message.id}>
            {message.role === "user" ? (
              <Question message={message} you={t("assistant.you")} />
            ) : (
              <Answer
                message={message}
                live={message.id === pending?.id ? stream : null}
                sourceHref={sourceHref}
                onStop={() => cancel.mutate({ threadId, messageId: message.id })}
              />
            )}
          </li>
        ))}
      </ol>

      <AssistantQuestionForm
        threadId={threadId}
        busy={pending !== null && stream.status === null}
      />

      <Dialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        title={t("assistant.thread.renameTitle")}
        actions={
          <>
            <Button variant="secondary" onClick={() => setRenaming(null)}>
              {shell.t("action.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!renaming?.trim()}
              onClick={() => {
                const next = renaming?.trim();
                if (next)
                  rename.mutate({ threadId, title: next }, { onSuccess: () => setRenaming(null) });
              }}
            >
              {t("assistant.thread.save")}
            </Button>
          </>
        }
      >
        <Field label={t("assistant.thread.renameLabel")} htmlFor="assistant-thread-rename">
          <Input
            value={renaming ?? ""}
            maxLength={120}
            onChange={(event) => setRenaming(event.target.value)}
          />
        </Field>
      </Dialog>

      <AlertDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("assistant.thread.deleteConfirm", { title })}
        description={t("assistant.thread.deleteBody")}
        confirmLabel={t("assistant.thread.delete")}
        cancelLabel={shell.t("action.cancel")}
        onConfirm={() => remove.mutate({ threadId }, { onSuccess: () => onDeleted?.() })}
      />
    </section>
  );
}

function Question({
  message,
  you,
}: {
  readonly message: AssistantMessageDto;
  readonly you: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <strong>{you}</strong>
      <p className="whitespace-pre-wrap">{message.content}</p>
    </div>
  );
}

interface AnswerProps {
  readonly message: AssistantMessageDto;
  // The stream, for the answer being written; null for one already saved.
  readonly live: ReturnType<typeof useAssistantStream> | null;
  readonly sourceHref: (path: string) => string;
  readonly onStop: () => void;
}

// Plain text with its line breaks kept. A model's Markdown reads as written, and nothing
// it produces is ever rendered as HTML.
function Answer({ message, live, sourceHref, onStop }: AnswerProps) {
  const { t } = useMessages("assistant");
  const text = live ? live.text : message.content;
  const status = live ? (live.status ?? "pending") : message.status;
  const sources = live?.status ? live.sources : message.sources;
  const writing = status === "pending";

  return (
    <div className="flex flex-col gap-2" aria-busy={writing}>
      <strong>{t("assistant.title")}</strong>
      {text.length > 0 ? <p className="whitespace-pre-wrap">{text}</p> : null}
      <div aria-live="polite" className="flex flex-wrap items-center gap-2">
        {writing ? (
          <>
            <small className="text-fg-muted">
              {live && !live.connected && text.length > 0
                ? t("assistant.answer.reconnecting")
                : text.length > 0
                  ? t("assistant.answer.writing")
                  : t("assistant.answer.waiting")}
            </small>
            <Button variant="secondary" onClick={onStop}>
              {t("assistant.answer.stop")}
            </Button>
          </>
        ) : null}
        {status === "cancelled" ? (
          <StatusBadge>{t("assistant.answer.cancelled")}</StatusBadge>
        ) : null}
        {status === "interrupted" ? (
          <StatusBadge tone="warning">{t("assistant.answer.interrupted")}</StatusBadge>
        ) : null}
        {status === "failed" ? (
          <StatusBadge tone="danger">{t("assistant.answer.failed")}</StatusBadge>
        ) : null}
      </div>
      {sources.length > 0 ? <Sources sources={sources} sourceHref={sourceHref} /> : null}
    </div>
  );
}

function Sources({
  sources,
  sourceHref,
}: {
  readonly sources: readonly AssistantSourceDto[];
  readonly sourceHref: (path: string) => string;
}) {
  const { t } = useMessages("assistant");
  return (
    <div className="flex flex-col gap-1">
      <small className="text-fg-muted">{t("assistant.sources.title")}</small>
      <ul className="flex flex-wrap gap-2">
        {sources.map((source, index) => (
          <li key={`${source.kind}:${source.id}:${index}`}>
            {source.available && source.path ? (
              <a href={sourceHref(source.path)} className="underline">
                {source.title}
              </a>
            ) : (
              <span className={source.available ? undefined : "text-fg-muted"}>
                {source.title}
                {source.available ? null : ` — ${t("assistant.sources.unavailable")}`}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
