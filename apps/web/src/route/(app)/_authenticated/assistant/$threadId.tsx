import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AssistantQueries,
  AssistantThreadList,
  AssistantThreadPanel,
  type ClientNamespace,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["assistant"] as const satisfies readonly ClientNamespace[];

// Authorship is checked by every procedure this page calls: another person's thread id is
// `NOT_FOUND`, the same as one that never existed.
export const Route = createFileRoute("/(app)/_authenticated/assistant/$threadId")({
  beforeLoad: RouteGuard.requirePermission("ai.assistant.use"),
  staticData: { messages: MESSAGES },
  loader: ({ context, params }) =>
    Promise.all([
      context.messages.ensure(MESSAGES),
      context.queryClient.ensureQueryData(AssistantQueries.thread(context.api, params.threadId)),
    ]),
  component: AssistantThread,
});

function AssistantThread() {
  const { threadId } = Route.useParams();
  const { t } = useMessages("assistant");
  const navigate = useNavigate();

  return (
    <main className="grid gap-6 md:grid-cols-[16rem_1fr]">
      <aside className="flex flex-col gap-3">
        <Link to="/assistant" className="underline">
          {t("assistant.threads.new")}
        </Link>
        <AssistantThreadList
          activeThreadId={threadId}
          onOpen={(next) =>
            void navigate({ to: "/assistant/$threadId", params: { threadId: next } })
          }
        />
      </aside>
      <AssistantThreadPanel
        threadId={threadId}
        // The in-app reader, under the session, where the source's access was checked.
        sourceHref={(path) => `/doc/${path}`}
        onDeleted={() => void navigate({ to: "/assistant" })}
      />
    </main>
  );
}
