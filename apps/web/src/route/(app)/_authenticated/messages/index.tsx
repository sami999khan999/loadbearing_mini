import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Can,
  type ClientNamespace,
  ConversationCreateForm,
  ConversationList,
  useCapabilities,
  useMessages,
} from "~/import.js";
import { RouteGuard } from "~/route/-guard.js";

const MESSAGES = ["messaging"] as const satisfies readonly ClientNamespace[];

export const Route = createFileRoute("/(app)/_authenticated/messages/")({
  beforeLoad: RouteGuard.requirePermission("messaging.conversation.read"),
  staticData: { messages: MESSAGES },
  loader: ({ context }) => context.messages.ensure(MESSAGES),
  component: Messages,
});

function Messages() {
  const { t } = useMessages("messaging");
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const open = (conversationId: string) =>
    void navigate({ to: "/messages/$conversationId", params: { conversationId } });

  return (
    <main>
      <h1>{t("messaging.inbox.title")}</h1>
      <ConversationList onOpen={open} />
      {
        // Both keys: the people to pick come from the member list.
      }
      <Can permission="messaging.conversation.create" capabilities={capabilities}>
        <Can permission="member.read" capabilities={capabilities}>
          <ConversationCreateForm onCreated={open} />
        </Can>
      </Can>
    </main>
  );
}
