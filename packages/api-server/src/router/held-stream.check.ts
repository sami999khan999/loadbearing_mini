import type { Container, OrganizationId } from "../import.js";
import type { HeldStream } from "./stream-revalidation.js";

// What the minute's question is, for every stream one tenant holds (`RV.4`). Run placed on
// that tenant's node, so each statement below is one tenant's and reaches that tenant's shard.
export class HeldStreamCheck {
  private constructor() {}

  // Three reads whatever the number of streams: who is still active, the room streams'
  // principals as they stand now, and which rooms still hold their people.
  public static async answer(
    container: Container,
    organizationId: OrganizationId,
    held: readonly HeldStream[],
  ): Promise<readonly boolean[]> {
    const first = held[0];
    if (!first) return [];

    return container.placed(first.principal, async () => {
      const active = await container.tenantMemberships.activeMemberIds(organizationId, [
        ...new Set(held.map(({ principal }) => principal.userId)),
      ]);

      const rooms = held.filter(({ conversationId }) => conversationId !== undefined);
      // The principals are re-read, never the ones captured at open, which would keep a
      // revoked read for the life of the stream. A key only narrows; see `refreshAll`.
      const refreshed = await container.principals.refreshAll(
        organizationId,
        rooms.map(({ principal }) => principal),
        active,
      );
      const watchers = rooms.flatMap(({ conversationId }, at) => {
        const actor = refreshed[at];
        return actor && conversationId ? [{ actor, conversationId }] : [];
      });
      const watching = await container.messaging.watch.canWatchAll(organizationId, watchers);

      const roomAnswers = new Map<HeldStream, boolean>();
      let next = 0;
      rooms.forEach((stream, at) => {
        roomAnswers.set(stream, refreshed[at] ? (watching[next++] ?? false) : false);
      });

      return held.map((stream) =>
        stream.conversationId === undefined
          ? active.has(stream.principal.userId)
          : (roomAnswers.get(stream) ?? false),
      );
    });
  }
}
