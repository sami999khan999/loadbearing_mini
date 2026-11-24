// `pnpm seed:dev`: everything `seed:prod` does, then a verified platform admin to sign in as,
// without the sign-up and Mailpit round trip. Local databases only.

import { randomBytes } from "node:crypto";
import { Password } from "@loadbearing/contracts";
// Better Auth's own hasher, so the stored hash is exactly what its sign-in verifies.
import { hashPassword } from "better-auth/crypto";
import { seedWith } from "./seed-env.js";

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

const report = await seedWith(async (seed) =>
  seed.dev({
    email,
    name,
    passwordHash: await hashPassword(password),
    replacePassword: given !== undefined,
  }),
);

console.log(`admin: ${email} (${report.admin?.created ? "created" : "already there"})`);
if (!report.admin?.passwordSet) {
  console.log("password unchanged; set ADMIN_PASSWORD to replace it.");
} else if (given === undefined) {
  // Printed once and stored nowhere: only the hash is in the database.
  console.log(`password: ${password}`);
} else {
  console.log("password: the ADMIN_PASSWORD you supplied");
}
