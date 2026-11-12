import type { ConversationId, OrganizationId } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import { ConversationAccess } from "./conversation-access.js";

// One held stream, as the per-minute check sees it: who holds it, and which room.
export interface ConversationWatcher {
  readonly actor: Principal;
  readonly conversationId: ConversationId;
}

// What a conversation stream asks when it opens, and again for as long as it stays open:
// the reading question, without the roster, the unread count or the names `get` attaches.
export class WatchConversationUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly access: ConversationAccess,
  ) {}

  public async execute(actor: Principal, conversationId: ConversationId): Promise<void> {
    this.authorizer.assert(actor, "messaging.conversation.read");
    await this.access.assertParticipant(actor, conversationId);
  }

  // `execute` for every held stream of one tenant, answered in order rather than thrown:
  // the same two questions, and one statement for every membership together (`RV.4`).
  public async canWatchAll(
    organizationId: OrganizationId,
    watchers: readonly ConversationWatcher[],
  ): Promise<readonly boolean[]> {
    const readers = new Set(
      watchers.filter(
        ({ actor }) =>
          actor.organizationId === organizationId && actor.can("messaging.conversation.read"),
      ),
    );
    if (readers.size === 0) return watchers.map(() => false);

    const participating = await this.access.participating(
      organizationId,
      [...readers].map(({ actor, conversationId }) => ({ conversationId, userId: actor.userId })),
    );

    return watchers.map(
      (watcher) =>
        readers.has(watcher) &&
        participating.has(
          ConversationAccess.keyOf({
            conversationId: watcher.conversationId,
            userId: watcher.actor.userId,
          }),
        ),
    );
  }
}
