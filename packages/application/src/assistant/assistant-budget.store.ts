import type { OrganizationId } from "../import.js";

// One tenant's tokens for one UTC day, counted where every web and worker process sees the
// same number. Losing it would let a tenant spend the day again, so it must never evict.
export abstract class AssistantBudgetStore {
  // Adds and returns the day's new total. The count expires on its own after the day.
  public abstract add(organizationId: OrganizationId, day: string, tokens: number): Promise<number>;

  public abstract used(organizationId: OrganizationId, day: string): Promise<number>;
}
