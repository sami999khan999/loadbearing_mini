import { useMessages } from "../i18n/index.js";
import {
  Button,
  type MessageDto,
  type MessageEmoji,
  MessagingMutations,
  Select,
  useApiClient,
} from "../import.js";

export interface ReactionBarProps {
  readonly message: MessageDto;
}

// The six reactions a message can carry, in the contract's order (`26.1`).
const EMOJI: readonly MessageEmoji[] = ["👍", "❤️", "😂", "🎉", "😮", "🙏"];

// A message's reactions as toggles with counts, then a picker for one not yet given.
export function ReactionBar({ message }: ReactionBarProps) {
  const { t } = useMessages("messaging");
  const client = useApiClient();
  const react = MessagingMutations.useReact(client);
  // A cached page from before reactions existed has none, rather than an empty list.
  const reactions = message.reactions ?? [];
  const given = new Set(reactions.map((reaction) => reaction.emoji));
  const toggle = (emoji: MessageEmoji, on: boolean) =>
    react.mutate({
      conversationId: message.conversationId,
      messageId: message.id,
      createdAt: message.createdAt,
      emoji,
      on,
    });

  return (
    <div className="ui-reactions flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => (
        <Button
          key={reaction.emoji}
          variant={reaction.mine ? "primary" : "secondary"}
          aria-pressed={reaction.mine}
          aria-label={t("messaging.reaction.toggle", {
            emoji: reaction.emoji,
            count: reaction.count,
          })}
          disabled={react.isPending}
          onClick={() => toggle(reaction.emoji, !reaction.mine)}
        >
          {`${reaction.emoji} ${reaction.count}`}
        </Button>
      ))}
      {given.size < EMOJI.length ? (
        <Select
          label={t("messaging.reaction.add")}
          placeholder={t("messaging.reaction.add")}
          value={null}
          onValueChange={(emoji) => toggle(emoji as MessageEmoji, true)}
          options={EMOJI.filter((emoji) => !given.has(emoji)).map((emoji) => ({
            value: emoji,
            label: emoji,
          }))}
        />
      ) : null}
    </div>
  );
}
