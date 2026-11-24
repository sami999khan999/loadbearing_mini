import { eq, Identifiers, type OrganizationId, type Placement, Uuid } from "../../../import.js";
import { BaseRepository } from "../../primitive/index.js";
import { organizations, shardAssignments } from "../../schema/index.js";

// The organization the deployment is run from: found by slug, created when missing, and
// marked as the platform tier. Idempotent, so every deploy may run it.
export class PlatformOrganizationSeed extends BaseRepository {
  protected override readonly placement: Placement = "catalog";

  public async run(slug: string): Promise<OrganizationId> {
    const existing = await this.db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, slug))
      .limit(1);

    const id = existing[0]?.id ?? Identifiers.organizationId.parse(Uuid.v7());
    if (!existing[0]) {
      await this.db
        .insert(organizations)
        .values({ id, slug, name: "Loadbearing", isPlatform: true });
    }

    // Marked every run, not only on create: a database seeded before the tier existed has
    // the row and not the flag, and `organizations_platform_uq` refuses a second tier.
    await this.db.update(organizations).set({ isPlatform: true }).where(eq(organizations.id, id));

    // Beside the row, which is what lets `PgShardResolver` throw on a missing one rather
    // than guess node 0.
    await this.db.insert(shardAssignments).values({ shardKey: id, node: 0 }).onConflictDoNothing();
    return id;
  }

  // The node the tier's routed rows are on: its docs are written there.
  public async nodeOf(id: OrganizationId): Promise<number> {
    const [row] = await this.db
      .select({ node: shardAssignments.node })
      .from(shardAssignments)
      .where(eq(shardAssignments.shardKey, id))
      .limit(1);
    return row?.node ?? 0;
  }
}
