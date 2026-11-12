import { useMessages } from "../i18n/index.js";
import { MessagingQueries, useApiClient, useAppQuery } from "../import.js";

export interface PresenceNoticeProps {
  readonly conversationId: string;
  readonly nameFor: (userId: string) => string | null;
  // The reader, who is always online to themselves and never listed.
  readonly selfId?: string;
}

// "Online now: Ada, Grace" under a conversation's title (`26.6`). Nothing when nobody is.
export function PresenceNotice({ conversationId, nameFor, selfId }: PresenceNoticeProps) {
  const { t } = useMessages("messaging");
  const client = useApiClient();
  const presence = useAppQuery(MessagingQueries.presence(client, conversationId));

  const names = (presence.data?.online ?? [])
    .filter((userId) => userId !== selfId)
    .map((userId) => nameFor(userId))
    .filter((name): name is string => name !== null);
  if (names.length === 0) return null;

  return (
    <p className="ui-presence text-fg-muted" aria-live="polite">
      {t("messaging.presence.online", { names: names.join(", ") })}
    </p>
  );
}
