// What `seed-dev.ts` and `seed-prod.ts` share: the nodes and the docs source read from the
// environment, a `DatabaseSeed` over them, and the report printed. Runs nothing on import.

import { resolve } from "node:path";
import { Database } from "../src/pg/primitive/index.js";
import { DatabaseSeed, DocTreeReader, type SeedReport } from "../src/pg/seed/index.js";
import { shardUrls } from "./shard-env.js";

// The same variable `apps/web/src/env.ts` reads, so the organization the seed creates and
// the one `bootstrap` enrolment joins are the same row.
const PLATFORM_SLUG = process.env.BOOTSTRAP_ORGANIZATION_SLUG ?? "loadbearing";

// Three folders up from `script/`: the repository whose docs trees are seeded.
const REPO_ROOT = resolve(import.meta.dirname, "../../..");

export const seedWith = async (run: (seed: DatabaseSeed) => Promise<SeedReport>) => {
  // Direct, never pooled: this runs once, against a database that may have no pooler yet.
  const nodes = shardUrls().map((shard) => new Database({ url: shard.directUrl }));
  let failed = false;
  try {
    const report = await run(
      new DatabaseSeed(nodes, PLATFORM_SLUG, DocTreeReader.fromGit(REPO_ROOT)),
    );
    console.log(`platform organization: ${report.platform}`);
    for (const line of report.brokenLinks)
      console.warn(`broken link, seeded as plain text: ${line}`);
    for (const space of report.docs.spaces) {
      console.log(`docs ${space.slug}: ${JSON.stringify(space.counts)}`);
    }
    for (const problem of report.docs.problems) console.error(`✗ ${problem}`);
    failed = report.docs.problems.length > 0;
    if (!failed) {
      console.log(`docs: ${report.docs.spaces.length} spaces at /doc, every link lands`);
    }
    return report;
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    for (const node of nodes) await node.close();
    if (failed) process.exitCode = 1;
  }
};
