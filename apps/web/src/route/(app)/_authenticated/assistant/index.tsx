import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AssistantQuestionForm,
  AssistantThreadList,
  type ClientNamespace,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["assistant"] as const satisfies readonly ClientNamespace[];

// Every source an answer is given is checked in the worker as the asker, so the permission
// gets you to the page and decides nothing about what the answers may draw on.
export const Route = createFileRoute("/(app)/_authenticated/assistant/")({
  beforeLoad: RouteGuard.requirePermission("ai.assistant.use"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: Assistant,
});

function Assistant() {
  const { t } = useMessages("assistant");
  const navigate = useNavigate();
  const open = (threadId: string) =>
    void navigate({ to: "/assistant/$threadId", params: { threadId } });

  return (
    <main className="flex flex-col gap-6">
      <header>
        <h1>{t("assistant.title")}</h1>
        <p className="text-fg-muted">{t("assistant.intro")}</p>
      </header>
      <AssistantQuestionForm onSent={(sent) => open(sent.threadId)} />
      <section aria-labelledby="assistant-threads">
        <h2 id="assistant-threads">{t("assistant.threads.title")}</h2>
        <AssistantThreadList onOpen={open} />
      </section>
    </main>
  );
}
