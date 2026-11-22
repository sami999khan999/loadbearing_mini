// A signed-in platform admin for a fresh database, without the sign-up and Mailpit round
// trip. Local only: it writes a verified account straight into the catalog.

import { randomBytes } from "node:crypto";
import { Password } from "@loadbearing/contracts";
// Better Auth's own hasher, so the stored hash is exactly what its sign-in verifies.
import { hashPassword } from "better-auth/crypto";
import { and, eq, Identifiers, Uuid } from "./src/import.js";
import { Database } from "./src/pg/primitive/index.js";
import { accounts, memberships, organizations, roles, users } from "./src/pg/schema/index.js";
import { TransactionScope } from "./src/pg/transaction/index.js";

const ROLE_KEY = "platform_admin";
// Better Auth's provider id for an email-and-password account.
const CREDENTIAL = "credential";

// From the environment, never argv: a password on the command line lands in shell history.
const email = (process.env.ADMIN_EMAIL ?? "admin@loadbearing.test").trim().toLowerCase();
const name = process.env.ADMIN_NAME ?? "Admin";
const given = process.env.ADMIN_PASSWORD;
const password = given ?? randomBytes(18).toString("base64url");

if (password.length < Password.MIN_LENGTH || password.length > Password.MAX_LENGTH) {
  throw new Error(
    `ADMIN_PASSWORD must be ${Password.MIN_LENGTH}–${Password.MAX_LENGTH} characters; sign-in enforces the same.`,
  );
}

const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");

// Hashed before the transaction: scrypt is deliberately slow, and a connection should not wait on it.
const hash = await hashPassword(password);
const database = new Database({ url });
const scope = new TransactionScope();

const outcome = await database.client.transaction(async (tx) =>
  scope.within(tx, "catalog", async () => {
    const [organization] = await tx
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.isPlatform, true))
      .limit(1);
    if (!organization)
      throw new Error("No organization is marked is_platform. Run `pnpm db:seed`.");

    const [role] = await tx
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, organization.id), eq(roles.key, ROLE_KEY)));
    if (!role)
      throw new Error(`No ${ROLE_KEY} role in ${organization.slug}. Run \`pnpm db:seed\`.`);

    const [existing] = await tx
      .select({ id: users.id, suspendedAt: users.suspendedAt })
      .from(users)
      .where(eq(users.email, email));

    // Refused, not reinstated: a suspension is a platform decision a seed should not undo.
    if (existing?.suspendedAt) {
      throw new Error(
        `${email} is suspended by the platform. Reinstate them at /platform/accounts.`,
      );
    }

    const userId = existing?.id ?? Identifiers.userId.parse(Uuid.v7());
    if (!existing) {
      await tx.insert(users).values({
        id: userId,
        name,
        email,
        emailVerified: true,
        lastActiveOrganizationId: organization.id,
      });
    }

    const [credential] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, CREDENTIAL)));

    // An existing password is kept unless one was asked for, so a re-run never locks anyone out.
    const setPassword = !credential || given !== undefined;
    if (!credential) {
      await tx.insert(accounts).values({
        id: Uuid.v7(),
        accountId: userId,
        providerId: CREDENTIAL,
        userId,
        password: hash,
      });
    } else if (setPassword) {
      await tx
        .update(accounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(eq(accounts.id, credential.id));
    }

    const [membership] = await tx
      .select({ roleId: memberships.roleId })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organization.id), eq(memberships.userId, userId)));
    if (!membership) {
      await tx.insert(memberships).values({
        id: Uuid.v7(),
        organizationId: organization.id,
        userId,
        roleId: role.id,
      });
    } else if (membership.roleId !== role.id) {
      await tx
        .update(memberships)
        .set({ roleId: role.id, deactivatedAt: null })
        .where(
          and(eq(memberships.organizationId, organization.id), eq(memberships.userId, userId)),
        );
    }

    return { created: !existing, setPassword, slug: organization.slug };
  }),
);

await database.close();

console.log(
  `${outcome.created ? "created" : "updated"}: ${email} is ${ROLE_KEY} in ${outcome.slug}`,
);
if (!outcome.setPassword) {
  console.log("password unchanged; set ADMIN_PASSWORD to replace it.");
} else if (given === undefined) {
  // Printed once and stored nowhere: only the hash is in the database.
  console.log(`password: ${password}`);
} else {
  console.log("password: the ADMIN_PASSWORD you supplied");
}
