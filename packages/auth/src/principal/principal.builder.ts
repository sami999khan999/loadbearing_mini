import type { ApiKeyResolver } from "../apikey/api-key.resolver.js";
import {
  CapabilitySet,
  type OrganizationId,
  Principal,
  type RequestHeaders,
  type SessionResolver,
  type UserId,
} from "../import.js";
import type { MembershipReader } from "../session/membership.reader.js";
import type { CapabilityCache } from "./capability.cache.js";

// Four credential types collapse into one `Principal` here, so a single
// `Authorizer.assert()` serves every surface.
export class PrincipalBuilder {
  public constructor(
    private readonly sessions: SessionResolver,
    private readonly apiKeys: ApiKeyResolver,
    private readonly capabilities: CapabilityCache,
    private readonly memberships: MembershipReader,
  ) {}

  public async fromHeaders(headers: RequestHeaders): Promise<Principal | null> {
    // First, deliberately: checking the session first would silently upgrade a scoped key
    // to the issuer's full permissions. See docs/reference/principal-builder.md.
    const apiKey = headers.get("x-api-key");
    if (apiKey) return this.apiKeys.resolve(apiKey);

    const session = await this.sessions.resolve(headers);
    if (!session) return null;

    return this.forUser(session.organizationId, session.userId);
  }

  // What held streams ask each minute: each principal as it stands now, `null` once inactive.
  // `active` is the caller's one `activeMemberIds` read, shared with the user streams.
  public async refreshAll(
    organizationId: OrganizationId,
    principals: readonly Principal[],
    active: ReadonlySet<UserId>,
  ): Promise<readonly (Principal | null)[]> {
    const held = principals.filter(
      (principal) =>
        principal.organizationId === organizationId &&
        principal.kind !== "system" &&
        active.has(principal.userId),
    );
    const [tenant, platform] = await Promise.all([
      this.capabilities.forUsers(
        organizationId,
        held.map((principal) => principal.userId),
      ),
      this.capabilities.platformForUsers(
        held.filter((principal) => principal.kind === "user").map((principal) => principal.userId),
      ),
    ]);

    return principals.map((principal) => {
      if (principal.organizationId !== organizationId) return null;
      if (principal.kind === "system") return principal;
      const granted = tenant.get(principal.userId);
      if (!active.has(principal.userId) || !granted) return null;

      // A key only narrows: its declared scopes are not in hand here.
      if (principal.kind === "api_key") {
        return Principal.apiKey(
          organizationId,
          principal.userId,
          principal.capabilities.intersect(granted),
        );
      }
      return PrincipalBuilder.merged(
        organizationId,
        principal.userId,
        granted,
        platform.get(principal.userId) ?? CapabilitySet.empty(),
      );
    });
  }

  private async forUser(organizationId: OrganizationId, userId: UserId): Promise<Principal | null> {
    // Before the capabilities, because a deactivated membership is not a principal with
    // nothing granted — it is no principal at all. One row on `memberships_uq`.
    if (!(await this.memberships.isActive(userId, organizationId))) return null;

    // In parallel: two independent reads, both usually cache hits, and serialising them
    // puts a second round trip on every request that misses.
    const [tenant, platform] = await Promise.all([
      this.capabilities.forUser(organizationId, userId),
      this.capabilities.platformFor(userId),
    ]);

    return PrincipalBuilder.merged(organizationId, userId, tenant, platform);
  }

  // Merged rather than chosen between: a platform admin switched into a customer tenant
  // is still a platform admin, and is still only a member of that tenant.
  private static merged(
    organizationId: OrganizationId,
    userId: UserId,
    tenant: CapabilitySet,
    platform: CapabilitySet,
  ): Principal {
    const capabilities = CapabilitySet.from({
      ...tenant.toJSON(),
      platform: platform.toJSON().platform,
    });
    return new Principal(organizationId, userId, capabilities, "user");
  }
}
