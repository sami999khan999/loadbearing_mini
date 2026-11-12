import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  DataTable,
  DateFormat,
  EmptyState,
  type MessageDto,
  MessagingQueries,
  useApiClient,
  useAppInfiniteQuery,
  useMemo,
  useState,
} from "../import.js";
import { AttachmentList } from "./attachment.list.js";
import { MentionText } from "./mention-text.js";
import { ReactionBar } from "./reaction.bar.js";
import { ThreadPanel } from "./thread.panel.js";

export interface MessageListProps {
  readonly conversationId: string;
  // From the conversation this thread belongs to, which is where the names are. Absent
  // renders no author at all rather than a uuid, which is what it did before `23.26b`.
  readonly nameFor?: (userId: string) => string | null;
  readonly mentionable?: readonly { readonly userId: string; readonly name: string }[];
}

// The page envelope, structurally: the contract's type is inferred per procedure and
// does not survive three packages of re-export.
interface MessagePage {
  readonly items: readonly MessageDto[];
  readonly olderCursor: string | null;
  readonly archivedThrough?: string | null;
}

export function MessageList({ conversationId, nameFor, mentionable }: MessageListProps) {
  const { t } = useMessages("messaging");
  const describe = useErrorMessage();
  const client = useApiClient();

  // One thread open at a time, under its root (`26.1`).
  const [open, setOpen] = useState<string | null>(null);
  const thread = useAppInfiniteQuery(MessagingQueries.messages(client, conversationId));

  // Reversed: the server pages backwards from the newest, and a conversation reads
  // oldest-first down the screen.
  const rows = useMemo<readonly MessageDto[]>(() => {
    const pages: readonly MessagePage[] = thread.data?.pages ?? [];
    return [...pages.flatMap((page) => page.items)].reverse();
  }, [thread.data]);

  if (thread.isPending) return <DataTable.Skeleton columns={1} rows={6} />;
  if (thread.isError) {
    return (
      <Callout tone="danger">
        {describe(thread.error)?.message ?? t("messaging.conversation.error")}
      </Callout>
    );
  }

  // The oldest page carries it, and only once there is nothing older left to load (`26.4`).
  const pages: readonly MessagePage[] = thread.data?.pages ?? [];
  const archivedThrough = thread.hasNextPage ? null : (pages.at(-1)?.archivedThrough ?? null);
  const archived = archivedThrough ? (
    <Callout tone="info">
      {t("messaging.conversation.archived", { month: archivedThrough.slice(0, 7) })}
    </Callout>
  ) : null;

  if (rows.length === 0) {
    return archived ?? <EmptyState title={t("messaging.conversation.empty")} />;
  }

  return (
    <div>
      {
        // At the top, because that is the direction older messages are in. Absent rather
        // than disabled once there are none.
        thread.hasNextPage ? (
          <Button variant="secondary" onClick={() => void thread.fetchNextPage()}>
            {t("messaging.conversation.loadOlder")}
          </Button>
        ) : (
          archived
        )
      }

      <ol>
        {rows.map((row) => (
          <li key={row.id}>
            {nameFor ? (
              <strong>{nameFor(row.authorId) ?? t("messaging.member.unknown")}</strong>
            ) : null}
            {row.deleted ? (
              <em>{t("messaging.conversation.deleted")}</em>
            ) : (
              <span>{MentionText.render(row.body, nameFor)}</span>
            )}
            <small>
              {DateFormat.day(row.createdAt)}
              {row.editedAt ? ` · ${t("messaging.conversation.edited")}` : ""}
            </small>
            {
              // Not on a row the server has not confirmed: its id is the client's, and a
              // reaction to it would name a message that does not exist.
              row.deleted || row.id === row.clientId ? null : (
                <>
                  <AttachmentList message={row} />
                  <ReactionBar message={row} />
                  <Button
                    variant="secondary"
                    aria-expanded={open === row.id}
                    onClick={() => setOpen(open === row.id ? null : row.id)}
                  >
                    {row.replyCount > 0
                      ? t("messaging.thread.replies", { count: row.replyCount })
                      : t("messaging.thread.reply")}
                  </Button>
                </>
              )
            }
            {open === row.id ? (
              <ThreadPanel
                root={row}
                {...(nameFor ? { nameFor } : {})}
                {...(mentionable ? { mentionable } : {})}
              />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
