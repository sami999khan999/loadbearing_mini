import {
  and,
  type CapabilityExplanation,
  type CapabilityRepository,
  CapabilityResolution,
  CapabilitySet,
  EntitlementMask,
  eq,
  gt,
  inArray,
  isNull,
  type OrganizationId,
  type OverrideRecord,
  or,
  type PermissionKey,
  PermissionRegistry,
  type Placement,
  sql,
  type UserId,
} from "../../import.js";
import { BaseRepository } from "../primitive/index.js";
import {
  disabledModules,
  entitlementAdjustments,
  goalMembers,
  memberships,
  organizations,
  permissionOverrides,
  planPermissions,
  plans,
  rolePermissions,
} from "../schema/index.js";

// A `CapabilityExplanation` while its rows are still being sorted to their user.
interface Explaining {
  readonly roleGrants: string[];
  readonly goalGrants: Record<string, string[]>;
  readonly overrides: OverrideRecord[];
  readonly entitlement: EntitlementMask;
}

export class PgCapabilityRepository extends BaseRepository implements CapabilityRepository {
  // RBAC — read on every request, before a key is known.
  protected override readonly placement: Placement = "catalog";

  // Org grants + goal grants + per-user overrides, deny winning, then the plan's mask.
  // A fold over `explainFor`, so the inspector's "why" and the gate's answer cannot differ.
  public async resolveFor(organizationId: OrganizationId, userId: UserId): Promise<CapabilitySet> {
    return CapabilityResolution.fold(await this.explainFor(organizationId, userId));
  }

  public async resolveForAll(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<ReadonlyMap<UserId, CapabilitySet>> {
    const explained = await this.explainForAll(organizationId, userIds);
    return new Map(
      [...explained].map(([userId, explanation]) => [
        userId,
        CapabilityResolution.fold(explanation),
      ]),
    );
  }

  public async explainFor(
    organizationId: OrganizationId,
    userId: UserId,
  ): Promise<CapabilityExplanation> {
    const explained = await this.explainForAll(organizationId, [userId]);
    const explanation = explained.get(userId);
    if (!explanation) throw new Error(`No explanation built for ${userId}.`);
    return explanation;
  }

  // Four targeted queries, not one join: the join is a cartesian product needing dedup.
  // The user is a column of each, so one user or a thousand is the same four.
  private async explainForAll(
    organizationId: OrganizationId,
    userIds: readonly UserId[],
  ): Promise<ReadonlyMap<UserId, CapabilityExplanation>> {
    if (userIds.length === 0) return new Map();
    const asked = [...new Set(userIds)];

    const orgRows = await this.db
      .select({ userId: memberships.userId, permission: rolePermissions.permission })
      .from(memberships)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, memberships.roleId))
      // Deactivated grants nothing. Defence in depth: `PrincipalBuilder` already
      // refuses the session, and this is what a bypass of it would still hit.
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          inArray(memberships.userId, asked),
          isNull(memberships.deactivatedAt),
        ),
      );

    const goalRows = await this.db
      .select({
        userId: goalMembers.userId,
        goalId: goalMembers.goalId,
        permission: rolePermissions.permission,
      })
      .from(goalMembers)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, goalMembers.roleId))
      .where(
        and(eq(goalMembers.organizationId, organizationId), inArray(goalMembers.userId, asked)),
      );

    // Expired rows are filtered here, which is the real mechanism: a cached set can outlive
    // an expiry by up to the TTL, and the sweep only tidies. A deny never expires.
    const overrideRows = await this.db
      .select({
        userId: permissionOverrides.userId,
        id: permissionOverrides.id,
        permission: permissionOverrides.permission,
        effect: permissionOverrides.effect,
        goalId: permissionOverrides.goalId,
        authority: permissionOverrides.authority,
        reason: permissionOverrides.reason,
        expiresAt: permissionOverrides.expiresAt,
      })
      .from(permissionOverrides)
      .where(
        and(
          eq(permissionOverrides.organizationId, organizationId),
          inArray(permissionOverrides.userId, asked),
          or(isNull(permissionOverrides.expiresAt), gt(permissionOverrides.expiresAt, sql`now()`)),
        ),
      );

    const entitlement = await this.entitlementFor(organizationId);

    const explained = new Map(
      asked.map((userId): [UserId, Explaining] => [
        userId,
        { roleGrants: [], goalGrants: {}, overrides: [], entitlement },
      ]),
    );
    for (const { userId, permission } of orgRows) {
      explained.get(userId)?.roleGrants.push(permission);
    }
    for (const { userId, goalId, permission } of goalRows) {
      const into = explained.get(userId);
      if (!into) continue;
      const bucket = into.goalGrants[goalId] ?? [];
      bucket.push(permission);
      into.goalGrants[goalId] = bucket;
    }
    for (const { userId, ...override } of overrideRows) {
      explained.get(userId)?.overrides.push(override);
    }

    return explained;
  }

  // One statement: four index lookups, tagged by kind and unioned. A join of the four would
  // multiply rows; a union is four small reads in one round trip.
  public async entitlementFor(organizationId: OrganizationId): Promise<EntitlementMask> {
    const planRows = this.db
      .select({ kind: sql<string>`'plan'`.as("kind"), value: planPermissions.permission })
      .from(organizations)
      .innerJoin(planPermissions, eq(planPermissions.planKey, organizations.planKey))
      .where(eq(organizations.id, organizationId));

    const unlimited = this.db
      .select({ kind: sql<string>`'unlimited'`.as("kind"), value: plans.key })
      .from(organizations)
      .innerJoin(plans, eq(plans.key, organizations.planKey))
      .where(and(eq(organizations.id, organizationId), eq(plans.isUnlimited, true)));

    // Expired rows are ignored here, which is the real mechanism; the sweep only tidies.
    const adjustments = this.db
      .select({
        kind: sql<string>`${entitlementAdjustments.effect}`.as("kind"),
        value: entitlementAdjustments.permission,
      })
      .from(entitlementAdjustments)
      .where(
        and(
          eq(entitlementAdjustments.organizationId, organizationId),
          or(
            isNull(entitlementAdjustments.expiresAt),
            gt(entitlementAdjustments.expiresAt, sql`now()`),
          ),
        ),
      );

    const disabled = this.db
      .select({ kind: sql<string>`'disabled'`.as("kind"), value: disabledModules.module })
      .from(disabledModules);

    const rows = await planRows.unionAll(unlimited).unionAll(adjustments).unionAll(disabled);

    const of = (kind: string) => rows.filter((row) => row.kind === kind).map((row) => row.value);
    return EntitlementMask.from({
      plan: rows.some((row) => row.kind === "unlimited") ? "all" : of("plan"),
      added: of("add"),
      removed: of("remove"),
      disabledModules: of("disabled"),
    });
  }

  public async resolvePlatformFor(userId: UserId): Promise<CapabilitySet> {
    const resolved = await this.resolvePlatformForAll([userId]);
    return resolved.get(userId) ?? CapabilitySet.empty();
  }

  // Two queries against the one organization marked `is_platform`, filtered to keys the
  // registry calls platform-scoped — a tenant key granted there reaches no axis at all.
  public async resolvePlatformForAll(
    userIds: readonly UserId[],
  ): Promise<ReadonlyMap<UserId, CapabilitySet>> {
    if (userIds.length === 0) return new Map();
    const asked = [...new Set(userIds)];
    const registry = PermissionRegistry.instance;
    const grants = new Map(asked.map((userId) => [userId, new Set<PermissionKey>()]));
    const denies = new Map(asked.map((userId) => [userId, new Set<PermissionKey>()]));

    const grantRows = await this.db
      .select({ userId: memberships.userId, permission: rolePermissions.permission })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, memberships.roleId))
      // Deactivated grants nothing, here most of all: removing someone's platform rights
      // is deactivating their membership in the tier.
      .where(
        and(
          eq(organizations.isPlatform, true),
          inArray(memberships.userId, asked),
          isNull(memberships.deactivatedAt),
        ),
      );

    for (const row of grantRows) {
      if (registry.isKnown(row.permission) && registry.scopeOf(row.permission) === "platform") {
        grants.get(row.userId)?.add(row.permission);
      }
    }

    // A platform deny for one user, on the tier's own organization. `goal_id` is ignored:
    // a platform key has no goal level, and a row carrying one is a mis-write.
    const overrideRows = await this.db
      .select({
        userId: permissionOverrides.userId,
        permission: permissionOverrides.permission,
        effect: permissionOverrides.effect,
      })
      .from(permissionOverrides)
      .innerJoin(organizations, eq(organizations.id, permissionOverrides.organizationId))
      .where(
        and(
          eq(organizations.isPlatform, true),
          inArray(permissionOverrides.userId, asked),
          // Live only, as the tenant query reads them: an expired exception grants nothing.
          or(isNull(permissionOverrides.expiresAt), gt(permissionOverrides.expiresAt, sql`now()`)),
        ),
      );

    for (const row of overrideRows) {
      if (!registry.isKnown(row.permission)) continue;
      if (registry.scopeOf(row.permission) !== "platform") continue;
      if (row.effect === "deny") denies.get(row.userId)?.add(row.permission);
      else grants.get(row.userId)?.add(row.permission);
    }

    return new Map(
      asked.map((userId) => [
        userId,
        CapabilitySet.from({
          wildcard: false,
          org: { grants: [], denies: [] },
          goals: {},
          platform: {
            grants: [...(grants.get(userId) ?? [])],
            denies: [...(denies.get(userId) ?? [])],
          },
        }),
      ]),
    );
  }
}
