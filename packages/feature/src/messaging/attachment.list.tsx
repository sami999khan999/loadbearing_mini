import { useMessages } from "../i18n/index.js";
import { Button, type MessageDto, MessagingMutations, useApiClient } from "../import.js";

export interface AttachmentListProps {
  readonly message: MessageDto;
}

// A message's files (`26.1`). Each opens through a link signed on click, valid for minutes,
// so nothing on the page is a URL anyone could pass around.
export function AttachmentList({ message }: AttachmentListProps) {
  const { t } = useMessages("messaging");
  const client = useApiClient();
  const open = MessagingMutations.useOpenAttachment(client);
  const attachments = message.attachments ?? [];
  if (attachments.length === 0) return null;

  return (
    <ul className="ui-attachments flex flex-wrap gap-1">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <Button
            variant="secondary"
            aria-label={t("messaging.attachment.open", { name: attachment.name })}
            disabled={open.isPending}
            onClick={() =>
              open.mutate(
                {
                  conversationId: message.conversationId,
                  attachmentId: attachment.id,
                  createdAt: message.createdAt,
                },
                { onSuccess: ({ url }) => window.open(url, "_blank", "noopener") },
              )
            }
          >
            {`${attachment.name} · ${Math.max(1, Math.round(attachment.size / 1024))} KB`}
          </Button>
        </li>
      ))}
    </ul>
  );
}
