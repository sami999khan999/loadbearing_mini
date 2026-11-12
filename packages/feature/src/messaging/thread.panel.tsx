import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DateFormat,
  type MessageDto,
  MessagingQueries,
  useApiClient,
  useAppInfiniteQuery,
  useMemo,
} from "../import.js";
import { AttachmentList } from "./attachment.list.js";
import { MentionText } from "./mention-text.js";
import { MessageComposer } from "./message-composer.form.js";
import { ReactionBar } from "./reaction.bar.js";

export interface ThreadPanelProps {
  readonly root: MessageDto;
  readonly nameFor?: (userId: string) => string | null;
  readonly mentionable?: readonly { readonly userId: string; readonly name: string }[];
}

interface ThreadPage {
  readonly items: readonly MessageDto[];
  readonly newerCursor: string | null;
  readonly rootArchived?: boolean;
}

// One root's replies, oldest first, and a composer that answers it (`26.1`). One level:
// a reply has no reply button of its own.
export function ThreadPanel({ root, nameFor, mentionable }: ThreadPanelProps) {
  const { t } = useMessages("messaging");
  const describe = useErrorMessage();
  const client = useApiClient();
  const thread = useAppInfiniteQuery(MessagingQueries.thread(client, root));

  const replies = useMemo<readonly MessageDto[]>(() => {
    const pages: readonly ThreadPage[] = thread.data?.pages ?? [];
    return pages.flatMap((page) => page.items);
  }, [thread.data]);
  // Annotated: the page type is reconstructed through three packages and can degrade.
  const first: ThreadPage | undefined = thread.data?.pages[0];
  const rootArchived = first?.rootArchived === true;

  return (
    <section className="ui-thread" aria-label={t("messaging.thread.title")}>
      {thread.isError ? <Callout tone="danger">{describe(thread.error)?.message}</Callout> : null}
      {rootArchived ? <Callout tone="info">{t("messaging.thread.rootArchived")}</Callout> : null}
      <ol>
        {replies.map((reply) => (
          <li key={reply.id}>
            {nameFor ? (
              <strong>{nameFor(reply.authorId) ?? t("messaging.member.unknown")}</strong>
            ) : null}
            {reply.deleted ? (
              <em>{t("messaging.conversation.deleted")}</em>
            ) : (
              <span>{MentionText.render(reply.body, nameFor)}</span>
            )}
            <small>{DateFormat.day(reply.createdAt)}</small>
            {reply.deleted ? null : (
              <>
                <AttachmentList message={reply} />
                <ReactionBar message={reply} />
              </>
            )}
          </li>
        ))}
      </ol>
      {thread.hasNextPage ? (
        <Button variant="secondary" onClick={() => void thread.fetchNextPage()}>
          {t("messaging.thread.more")}
        </Button>
      ) : null}
      <MessageComposer
        conversationId={root.conversationId}
        parent={{ messageId: root.id, createdAt: root.createdAt }}
        onSent={() => void thread.refetch()}
        {...(mentionable ? { mentionable } : {})}
      />
    </section>
  );
}
