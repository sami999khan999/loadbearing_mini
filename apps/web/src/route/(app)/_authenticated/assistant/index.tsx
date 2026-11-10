import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AssistantQueries,
  AssistantQuestionForm,
  AssistantThreadList,
  AssistantUsagePanel,
  Can,
  CapabilitySet,
  type ClientNamespace,
  useCapabilities,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["assistant"] as const satisfies readonly ClientNamespace[];

// Every source an answer is given is checked in the worker as the asker, so the permission
// gets you to the page and decides nothing about what the answers may draw on.
export const Route = createFileRoute("/(app)/_authenticated/assistant/")({
  beforeLoad: RouteGuard.requirePermission("ai.assistant.use"),
  staticData: { messages: MESSAGES },
  // The meter only for whoever may read it: prefetching a refused read throws the page away.
  loader: ({ context }) =>
    Promise.all([
      context.messages.ensure(MESSAGES),
      CapabilitySet.from(context.capabilities).can("ai.usage.read")
        ? context.queryClient.ensureQueryData(AssistantQueries.usage(context.api))
        : null,
    ]),
  component: Assistant,
});

function Assistant() {
  const { t } = useMessages("assistant");
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const open = (threadId: string) =>
    void navigate({ to: "/assistant/$threadId", params: { threadId } });

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1>{t("assistant.title")}</h1>
        <p className="text-fg-muted">{t("assistant.intro")}</p>
      </header>
      {
        // An administrator's meter, beside the questions rather than on its own page: it
        // is one paragraph, and whoever watches the spend also asks.
      }
      <Can permission="ai.usage.read" capabilities={capabilities}>
        <AssistantUsagePanel />
      </Can>
      <AssistantQuestionForm onSent={(sent) => open(sent.threadId)} />
      <section aria-labelledby="assistant-threads">
        <h2 id="assistant-threads">{t("assistant.threads.title")}</h2>
        <AssistantThreadList onOpen={open} />
      </section>
    </main>
  );
}
