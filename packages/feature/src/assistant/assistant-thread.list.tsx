import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  AssistantQueries,
  type AssistantThreadDto,
  Button,
  Callout,
  DataTable,
  DateFormat,
  EmptyState,
  useApiClient,
  useAppInfiniteQuery,
  useMemo,
} from "../import.js";

export interface AssistantThreadListProps {
  readonly onOpen: (threadId: string) => void;
  // The thread on screen, marked as the current page for assistive technology.
  readonly activeThreadId?: string;
  readonly limit?: number;
}

// The page envelope, structurally, for the reason `ConversationList` gives.
interface ThreadPage {
  readonly items: readonly AssistantThreadDto[];
  readonly nextCursor: string | null;
}

// The reader's own threads, newest activity first. Nobody else's are ever listed.
export function AssistantThreadList({
  onOpen,
  activeThreadId,
  limit = 20,
}: AssistantThreadListProps) {
  const { t } = useMessages("assistant");
  const describe = useErrorMessage();
  const client = useApiClient();
  const threads = useAppInfiniteQuery(AssistantQueries.threads(client, { limit }));

  const rows = useMemo<readonly AssistantThreadDto[]>(() => {
    const pages: readonly ThreadPage[] = threads.data?.pages ?? [];
    return pages.flatMap((page) => page.items);
  }, [threads.data]);

  if (threads.isPending) return <DataTable.Skeleton columns={1} rows={5} />;
  if (threads.isError) {
    return (
      <Callout tone="danger">
        {describe(threads.error)?.message ?? t("assistant.threads.error")}
      </Callout>
    );
  }
  if (rows.length === 0) return <EmptyState title={t("assistant.threads.empty")} />;

  return (
    <nav aria-label={t("assistant.threads.title")}>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              aria-current={row.id === activeThreadId ? "page" : undefined}
              onClick={() => onOpen(row.id)}
              className="flex w-full flex-col rounded-md px-2 py-1.5 text-left hover:bg-muted aria-[current=page]:bg-muted"
            >
              <span className="truncate">{row.title}</span>
              <small className="text-fg-muted">{DateFormat.day(row.updatedAt)}</small>
            </button>
          </li>
        ))}
      </ul>
      {threads.hasNextPage ? (
        <Button variant="secondary" onClick={() => void threads.fetchNextPage()}>
          {t("assistant.threads.loadMore")}
        </Button>
      ) : null}
    </nav>
  );
}
