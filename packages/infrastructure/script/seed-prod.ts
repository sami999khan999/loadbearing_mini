// `pnpm seed:prod`: what every deploy may run, after `db migrate`. The platform organization,
// its partitions and roles, and every docs tree in the repository, read by its staff at `/doc`.

import { seedWith } from "./seed-env.js";

await seedWith((seed) => seed.prod());

// Said out loud: otherwise someone seeds, signs up, and lands in an organization of their own.
if ((process.env.AUTH_ENROLMENT_MODE ?? "personal") !== "bootstrap") {
  console.log(
    'note: AUTH_ENROLMENT_MODE is not "bootstrap", so nobody joins the platform organization',
  );
  console.log("      by signing up. `pnpm ops platform-grant <email>` makes the first admin.");
}
