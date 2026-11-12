import { useSession } from "../auth/index.js";
import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  Button,
  Callout,
  type ConversationDto,
  Field,
  type FormEvent,
  Input,
  type MemberDto,
  MemberQueries,
  MessagingMutations,
  useApiClient,
  useAppQuery,
  useMemo,
  useState,
} from "../import.js";

export interface ConversationCreateFormProps {
  // Where to go once it exists; the inbox moves to the new room.
  readonly onCreated: (conversationId: string) => void;
}

// One person and no name is a direct message; anything else is a group. The contract
// refuses a named or multi-person direct one, so the kind is derived, never chosen.
export function ConversationCreateForm({ onCreated }: ConversationCreateFormProps) {
  const { t } = useMessages("messaging");
  const describe = useErrorMessage();
  const client = useApiClient();
  const { user } = useSession();
  // The first hundred, the schema's cap: a larger organization needs a search here.
  const members = useAppQuery(MemberQueries.list(client, { limit: 100, offset: 0 }));
  const create = MessagingMutations.useCreateConversation(client);

  const [picked, setPicked] = useState<readonly string[]>([]);
  const [name, setName] = useState("");

  // Never the asker, who the use-case adds, and never someone who could not read it.
  const people = useMemo(() => {
    const items: readonly MemberDto[] = members.data?.items ?? [];
    return items.filter((member) => member.userId !== user?.id && !member.deactivated);
  }, [members.data, user?.id]);

  const toggle = (userId: string) =>
    setPicked((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );

  const title = name.trim();
  const direct = picked.length === 1 && title === "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (picked.length === 0) return;
    create.mutate(
      {
        kind: direct ? "direct" : "channel",
        memberIds: picked as MemberDto["userId"][],
        ...(direct || title === "" ? {} : { title }),
      },
      {
        onSuccess: (conversation: ConversationDto) => {
          setPicked([]);
          setName("");
          onCreated(conversation.id);
        },
      },
    );
  };

  const failure = describe(create.error);

  return (
    <form onSubmit={submit} noValidate aria-labelledby="conversation-create-title">
      <h2 id="conversation-create-title">{t("messaging.create.title")}</h2>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 font-medium text-fg text-sm">{t("messaging.create.people")}</legend>
        {people.length === 0 && !members.isPending ? (
          <p className="text-fg-muted text-sm">{t("messaging.create.nobody")}</p>
        ) : null}
        <ul className="m-0 grid list-none gap-1 p-0">
          {people.map((member) => (
            <li key={member.userId}>
              <label className="inline-flex cursor-pointer items-center gap-2 text-fg text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={picked.includes(member.userId)}
                  onChange={() => toggle(member.userId)}
                />
                {member.name}
              </label>
            </li>
          ))}
        </ul>
      </fieldset>

      <Field
        label={t("messaging.create.name")}
        htmlFor="conversation-create-name"
        hint={t("messaging.create.hint")}
      >
        <Input
          id="conversation-create-name"
          value={name}
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>

      {failure ? <Callout tone="danger">{failure.message}</Callout> : null}

      <Button type="submit" disabled={create.isPending || picked.length === 0}>
        {t("messaging.create.submit")}
      </Button>
    </form>
  );
}
