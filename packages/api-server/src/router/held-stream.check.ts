import type { Container, OrganizationId } from "../import.js";
import type { HeldStream } from "./stream-revalidation.js";

// What the minute's question is, for every stream one tenant holds (`RV.4`). Run placed on
// that tenant's node, so the statement is one tenant's and reaches that tenant's shard.
export class HeldStreamCheck {
  private constructor() {}

  // One read whatever the number of streams: who of them is still an active member.
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
      return held.map(({ principal }) => active.has(principal.userId));
    });
  }
}
