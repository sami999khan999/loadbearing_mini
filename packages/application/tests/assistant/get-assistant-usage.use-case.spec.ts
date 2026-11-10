import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import { ForbiddenError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import type { AssistantUsageRepository } from "../../src/assistant/assistant-usage.repository.js";
import { GetAssistantUsageUseCase } from "../../src/assistant/get-assistant-usage.use-case.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");
const clock = { now: () => new Date("2026-09-25T21:30:00.000Z") };

class RecordingUsage {
  public readonly asked: { organizationId: OrganizationId; since: string }[] = [];

  public totalSince(organizationId: OrganizationId, since: Date) {
    this.asked.push({ organizationId, since: since.toISOString() });
    const today = since.getUTCDate() === 25;
    return Promise.resolve({
      inputTokens: today ? 10 : 300,
      outputTokens: today ? 5 : 120,
      answers: today ? 1 : 9,
    });
  }
}

const actor = (grants: readonly PermissionKey[]) =>
  new Principal(
    TENANT,
    ACTOR,
    CapabilitySet.from({ wildcard: false, org: { grants, denies: [] }, goals: {} }),
  );

const useCase = (usage: RecordingUsage, limit = 50_000) =>
  new GetAssistantUsageUseCase(
    new Authorizer(),
    usage as unknown as AssistantUsageRepository,
    clock,
    limit,
  );

describe("GetAssistantUsageUseCase", () => {
  it("sums the actor's own tenant from UTC midnight and from the first of the month", async () => {
    const usage = new RecordingUsage();
    const result = await useCase(usage).execute(actor(["ai.usage.read"]));

    expect(usage.asked).toEqual([
      { organizationId: TENANT, since: "2026-09-25T00:00:00.000Z" },
      { organizationId: TENANT, since: "2026-09-01T00:00:00.000Z" },
    ]);
    expect(result).toEqual({
      today: { inputTokens: 10, outputTokens: 5, answers: 1 },
      month: { inputTokens: 300, outputTokens: 120, answers: 9 },
      dailyTokenLimit: 50_000,
    });
  });

  it("reports no cap as zero, never a negative limit", async () => {
    const result = await useCase(new RecordingUsage(), -1).execute(actor(["ai.usage.read"]));
    expect(result.dailyTokenLimit).toBe(0);
  });

  it("refuses a member who may ask but not read the meter", async () => {
    await expect(
      useCase(new RecordingUsage()).execute(actor(["ai.assistant.use"])),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
