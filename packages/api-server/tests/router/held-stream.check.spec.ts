import { describe, expect, it, vi } from "vitest";
import type { Container, ConversationId, Principal, UserId } from "../../src/import.js";
import { HeldStreamCheck } from "../../src/router/held-stream.check.js";
import type { HeldStream } from "../../src/router/stream-revalidation.js";

// `RV.4`. Whatever number of streams a tenant holds, the check is one read of who is still
// active, one refresh of the room streams' principals and one membership read.
const ORG = "org" as never;
const ROOM = "room" as ConversationId;
const principal = (userId: string): Principal =>
  ({ organizationId: ORG, userId, kind: "user" }) as unknown as Principal;

function build(options: { readonly active: readonly string[]; readonly rooms: readonly string[] }) {
  const activeMemberIds = vi.fn(() => Promise.resolve(new Set(options.active as UserId[])));
  const refreshAll = vi.fn(
    (_org: unknown, held: readonly Principal[], active: ReadonlySet<UserId>) =>
      Promise.resolve(held.map((entry) => (active.has(entry.userId) ? entry : null))),
  );
  const canWatchAll = vi.fn(
    (_org: unknown, watchers: readonly { actor: Principal; conversationId: ConversationId }[]) =>
      Promise.resolve(watchers.map(({ actor }) => options.rooms.includes(actor.userId))),
  );
  const placed = vi.fn(<T>(_principal: Principal, work: () => Promise<T>) => work());
  const container = {
    placed,
    tenantMemberships: { activeMemberIds },
    principals: { refreshAll },
    messaging: { watch: { canWatchAll } },
  } as unknown as Container;
  return { container, activeMemberIds, refreshAll, canWatchAll, placed };
}

describe("HeldStreamCheck", () => {
  it("answers each stream alone, from one read of each kind", async () => {
    const { container, activeMemberIds, refreshAll, canWatchAll, placed } = build({
      active: ["ada", "bob", "cy"],
      rooms: ["ada"],
    });
    const held: HeldStream[] = [
      { principal: principal("ada") },
      { principal: principal("dee") },
      { principal: principal("ada"), conversationId: ROOM },
      { principal: principal("bob"), conversationId: ROOM },
      { principal: principal("dee"), conversationId: ROOM },
    ];

    const answers = await HeldStreamCheck.answer(container, ORG, held);

    expect(answers).toEqual([true, false, true, false, false]);
    expect(placed).toHaveBeenCalledTimes(1);
    expect(activeMemberIds).toHaveBeenCalledTimes(1);
    expect(refreshAll).toHaveBeenCalledTimes(1);
    expect(canWatchAll).toHaveBeenCalledTimes(1);
  });

  it("asks nothing of the rooms when only user streams are held", async () => {
    const { container, canWatchAll } = build({ active: ["ada"], rooms: [] });

    const answers = await HeldStreamCheck.answer(container, ORG, [{ principal: principal("ada") }]);

    expect(answers).toEqual([true]);
    expect(canWatchAll).toHaveBeenCalledWith(ORG, []);
  });

  it("asks nothing for no streams", async () => {
    const { container, placed } = build({ active: [], rooms: [] });

    await expect(HeldStreamCheck.answer(container, ORG, [])).resolves.toEqual([]);
    expect(placed).not.toHaveBeenCalled();
  });
});
