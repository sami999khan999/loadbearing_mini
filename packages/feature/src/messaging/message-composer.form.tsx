import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  type MessageAttachmentType,
  MessageContract,
  MessagingMutations,
  Select,
  Textarea,
  useApiClient,
  useRef,
  useState,
} from "../import.js";
import { MentionText } from "./mention-text.js";

export interface MessageComposerProps {
  readonly conversationId: string;
  // The room's other members, for the mention picker (`26.7`). Absent shows no picker.
  readonly mentionable?: readonly { readonly userId: string; readonly name: string }[];
  // Set, and every send is a reply to that root (`26.1`).
  readonly parent?: { readonly messageId: string; readonly createdAt: Date };
  // After the server took it: a thread refetches, since replies have no optimistic row.
  readonly onSent?: () => void;
}

// Matches the use-case's own rate limit. Throttling here as well keeps the request off
// the wire rather than having the server refuse it forty times a sentence.
const TYPING_INTERVAL_MS = 2_000;

export function MessageComposer({
  conversationId,
  mentionable = [],
  parent,
  onSent,
}: MessageComposerProps) {
  const { t } = useMessages("messaging");
  const describe = useErrorMessage();
  const client = useApiClient();

  const [body, setBody] = useState("");
  const lastTypedAt = useRef(0);

  const send = MessagingMutations.useSend(client, conversationId);
  const upload = MessagingMutations.useUploadAttachment(client);
  // Uploaded and waiting for the send that names them (`26.1`).
  const [files, setFiles] = useState<
    readonly {
      readonly id: string;
      readonly name: string;
      readonly contentType: MessageAttachmentType;
    }[]
  >([]);
  const typing = MessagingMutations.useStartTyping(client);

  const submit = () => {
    const trimmed = body.trim();
    if (trimmed.length === 0 && files.length === 0) return;

    // The client generates the key, which is both the optimistic id and the dedupe key:
    // a retried send carries the same one and produces one row.
    send.mutate(
      {
        conversationId,
        body: trimmed,
        clientId: crypto.randomUUID(),
        attachments: [...files],
        ...(parent
          ? { parent: { messageId: parent.messageId as never, createdAt: parent.createdAt } }
          : {}),
      },
      onSent ? { onSuccess: onSent } : undefined,
    );
    setBody("");
    setFiles([]);
  };

  const signal = () => {
    const now = Date.now();
    if (now - lastTypedAt.current < TYPING_INTERVAL_MS) return;

    lastTypedAt.current = now;
    typing.mutate({ conversationId });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        rows={3}
        value={body}
        placeholder={t("messaging.compose.placeholder")}
        onChange={(event) => {
          setBody(event.target.value);
          signal();
        }}
        onKeyDown={(event) => {
          // Enter sends, Shift+Enter breaks the line. The convention every chat client
          // shares, and the reason this is a textarea rather than an input.
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          submit();
        }}
      />
      <small>{t("messaging.compose.hint")}</small>
      {mentionable.length > 0 ? (
        <Select
          label={t("messaging.compose.mention")}
          placeholder={t("messaging.compose.mention")}
          value={null}
          placement="above"
          onValueChange={(userId) => {
            if (!userId) return;
            setBody(
              (current) =>
                `${current}${current && !current.endsWith(" ") ? " " : ""}${MentionText.token(userId)} `,
            );
          }}
          options={mentionable.map((member) => ({ value: member.userId, label: member.name }))}
        />
      ) : null}

      <label className="ui-attach">
        <span>{t("messaging.attachment.add")}</span>
        <input
          type="file"
          accept={MessageContract.attachmentType.options.join(",")}
          disabled={upload.isPending || files.length >= 5}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            upload.mutate(
              { conversationId, file },
              { onSuccess: (attached) => setFiles((current) => [...current, attached]) },
            );
          }}
        />
      </label>
      {files.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {files.map((file) => (
            <li key={file.id}>
              <Button
                variant="secondary"
                aria-label={t("messaging.attachment.remove", { name: file.name })}
                onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
              >
                {`${file.name} ×`}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {upload.isError ? (
        <Callout tone="danger">
          {describe(upload.error)?.message ?? t("messaging.attachment.failed")}
        </Callout>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        disabled={(body.trim().length === 0 && files.length === 0) || upload.isPending}
      >
        {t("messaging.compose.send")}
      </Button>

      {send.isError ? (
        <Callout tone="danger">
          {describe(send.error)?.message ?? t("messaging.compose.failed")}
        </Callout>
      ) : null}
    </form>
  );
}
