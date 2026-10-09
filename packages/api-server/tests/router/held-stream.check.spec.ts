import { describe, expect, it, vi } from "vitest";
import type { Container, Principal, UserId } from "../../src/import.js";
import { HeldStreamCheck } from "../../src/router/held-stream.check.js";

// `RV.4`. Whatever number of streams a tenant holds, the check is one read of who is
// still an active member.
const ORG = "org" as never;
const principal = (userId: string): Principal =>
  ({ organizationId: ORG, userId }) as unknown as Principal;

function build(active: readonly string[]) {
  const activeMemberIds = vi.fn(() => Promise.resolve(new Set(active as UserId[])));
  const placed = vi.fn(<T>(_principal: Principal, work: () => Promise<T>) => work());
  const container = { placed, tenantMemberships: { activeMemberIds } } as unknown as Container;
  return { container, activeMemberIds, placed };
}

describe("HeldStreamCheck", () => {
  it("answers each stream alone, from one read", async () => {
    const { container, activeMemberIds, placed } = build(["ada", "bob"]);
    const held = ["ada", "dee", "ada", "bob"].map((id) => ({ principal: principal(id) }));

    const answers = await HeldStreamCheck.answer(container, ORG, held);

    expect(answers).toEqual([true, false, true, true]);
    expect(placed).toHaveBeenCalledTimes(1);
    expect(activeMemberIds).toHaveBeenCalledTimes(1);
    expect(activeMemberIds).toHaveBeenCalledWith(ORG, ["ada", "dee", "bob"]);
  });

  it("asks nothing for no streams", async () => {
    const { container, placed } = build([]);

    await expect(HeldStreamCheck.answer(container, ORG, [])).resolves.toEqual([]);
    expect(placed).not.toHaveBeenCalled();
  });
});
