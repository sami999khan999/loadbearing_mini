import {
  and,
  eq,
  Identifiers,
  type OrganizationId,
  type Placement,
  Uuid,
} from "../../../import.js";
import { BaseRepository } from "../../primitive/index.js";
import { accounts, memberships, roles, users } from "../../schema/index.js";

const ROLE_KEY = "platform_admin";
// Better Auth's provider id for an email-and-password account.
const CREDENTIAL = "credential";

export interface AdminAccount {
  readonly email: string;
  readonly name: string;
  // Hashed by the caller with Better Auth's own hasher, so sign-in verifies exactly this.
  readonly passwordHash: string;
  // False keeps an existing password, so a re-run never locks anyone out.
  readonly replacePassword: boolean;
}

export interface AdminAccountOutcome {
  readonly created: boolean;
  readonly passwordSet: boolean;
}

// A signed-in platform admin for a local database, without the sign-up and mail round
// trip: a verified account written straight into the catalog. Development only.
export class AdminAccountSeed extends BaseRepository {
  protected override readonly placement: Placement = "catalog";

  public async run(platform: OrganizationId, admin: AdminAccount): Promise<AdminAccountOutcome> {
    const [role] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, platform), eq(roles.key, ROLE_KEY)));
    if (!role) throw new Error(`No ${ROLE_KEY} role in the platform organization.`);

    const [existing] = await this.db
      .select({ id: users.id, suspendedAt: users.suspendedAt })
      .from(users)
      .where(eq(users.email, admin.email));
    // Refused, not reinstated: a suspension is a platform decision a seed must not undo.
    if (existing?.suspendedAt) {
      throw new Error(`${admin.email} is suspended by the platform. Reinstate them first.`);
    }

    const userId = existing?.id ?? Identifiers.userId.parse(Uuid.v7());
    if (!existing) {
      await this.db.insert(users).values({
        id: userId,
        name: admin.name,
        email: admin.email,
        emailVerified: true,
        lastActiveOrganizationId: platform,
      });
    }

    const [credential] = await this.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, CREDENTIAL)));
    const passwordSet = !credential || admin.replacePassword;
    if (!credential) {
      await this.db.insert(accounts).values({
        id: Uuid.v7(),
        accountId: userId,
        providerId: CREDENTIAL,
        userId,
        password: admin.passwordHash,
      });
    } else if (passwordSet) {
      await this.db
        .update(accounts)
        .set({ password: admin.passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, credential.id));
    }

    const member = and(eq(memberships.organizationId, platform), eq(memberships.userId, userId));
    const [membership] = await this.db
      .select({ roleId: memberships.roleId })
      .from(memberships)
      .where(member);
    if (!membership) {
      await this.db
        .insert(memberships)
        .values({ id: Uuid.v7(), organizationId: platform, userId, roleId: role.id });
    } else if (membership.roleId !== role.id) {
      await this.db.update(memberships).set({ roleId: role.id, deactivatedAt: null }).where(member);
    }

    return { created: !existing, passwordSet };
  }
}
