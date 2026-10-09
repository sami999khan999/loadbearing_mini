import type { ActivityLogger, CapabilityInvalidator, UnitOfWork } from "../port/index.js";
import { Principal } from "../primitive/index.js";
import type { PermissionOverrideRepository } from "./permission-override.repository.js";

export interface ExpiredOverrides {
  readonly overrides: number;
}

// The worker's nightly tidy. An expired grant already grants nothing — resolution reads
// live rows only — so this removes it, audits it in its own org, and flushes that person.
export class ExpirePermissionOverridesUseCase {
  public static readonly BATCH = 500;

  public constructor(
    private readonly overrides: PermissionOverrideRepository,
    private readonly invalidator: CapabilityInvalidator,
    private readonly activity: ActivityLogger,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  // No permission is asserted: the caller is the worker's system principal, on no request
  // path. Each audit row is written in the org the grant belonged to.
  public async execute(system: Principal, now: Date): Promise<ExpiredOverrides> {
    let total = 0;

    // A page per transaction, so a backlog is many short ones rather than one that holds
    // every row and every lock until the last. A short page is the end.
    for (;;) {
      const expired = await this.overrides.findExpired(now, ExpirePermissionOverridesUseCase.BATCH);
      if (expired.length === 0) break;

      await this.unitOfWork.run(async () => {
        for (const row of expired) {
          await this.overrides.delete(row.organizationId, row.id);
          await this.activity.record(
            new Principal(row.organizationId, system.userId, system.capabilities, system.kind),
            "override.expired",
            { userId: row.userId, permission: row.permission },
          );
        }
      });

      for (const row of expired) await this.invalidator.invalidate(row.organizationId, row.userId);
      total += expired.length;
      if (expired.length < ExpirePermissionOverridesUseCase.BATCH) break;
    }

    return { overrides: total };
  }
}
