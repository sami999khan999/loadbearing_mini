import type { OrganizationId } from "../../import.js";
import { type Database, DatabaseCluster } from "../primitive/index.js";
import { ShardScope, TransactionScope } from "../transaction/index.js";
import { type AdminAccount, type AdminAccountOutcome, AdminAccountSeed } from "./admin/index.js";
import { type DocSeedReport, DocSpaceSeed, DocTreeReader } from "./doc/index.js";
import { PlatformOrganizationSeed, PlatformRoleSeed } from "./platform/index.js";
import { SystemRoleSeed } from "./system/index.js";
import { TenantPartitionSeed } from "./tenant/index.js";

export interface SeedReport {
  readonly platform: OrganizationId;
  readonly docs: DocSeedReport;
  // Links to files that are not there, seeded as plain text.
  readonly brokenLinks: readonly string[];
  // Null in production, which seeds no account.
  readonly admin: AdminAccountOutcome | null;
}

// Where every seed step converges. `prod()` is what a deploy runs, safe to repeat: the
// platform organization, its partitions and roles, and the repository's docs.
export class DatabaseSeed {
  private readonly scope = new TransactionScope();
  // Nothing is placed by a resolver: each step names its node, over a one-node cluster.
  private readonly shards = new ShardScope();

  // `nodes` in index order, node 0 the catalog; the caller opens and closes them.
  public constructor(
    private readonly nodes: readonly Database[],
    private readonly platformSlug: string,
    private readonly docs: DocTreeReader,
  ) {}

  public prod(): Promise<SeedReport> {
    return this.seed(null);
  }

  // Production's steps, then a verified platform admin to sign in as.
  public dev(admin: AdminAccount): Promise<SeedReport> {
    return this.seed(admin);
  }

  private async seed(admin: AdminAccount | null): Promise<SeedReport> {
    // Read and checked before anything connects: a bad page fails with nothing written.
    const reading = this.docs.read();
    const catalog = this.nodes[0];
    if (!catalog) throw new Error("DATABASE_URL is required.");

    const cluster = DatabaseCluster.single(catalog);
    // One transaction: an organization with no roles is a tenant nobody can be a member of.
    const founded = await catalog.client.transaction(async (tx) =>
      this.scope.within(tx, "catalog", async () => {
        const organization = new PlatformOrganizationSeed(cluster, this.scope, this.shards);
        const platform = await organization.run(this.platformSlug);
        await new TenantPartitionSeed(cluster, this.scope, this.shards).run(platform);
        await new SystemRoleSeed(cluster, this.scope, this.shards).run(platform);
        // After the mark: it finds the tier by the flag, not by the slug.
        await new PlatformRoleSeed(cluster, this.scope, this.shards).run();
        const seeded = admin
          ? await new AdminAccountSeed(cluster, this.scope, this.shards).run(platform, admin)
          : null;
        return { platform, node: await organization.nodeOf(platform), admin: seeded };
      }),
    );

    const node = this.nodes[founded.node];
    if (!node)
      throw new Error(`The platform organization is on node ${founded.node}, not configured.`);
    const docs = new DocSpaceSeed(DatabaseCluster.single(node), this.scope, this.shards);
    const report = await this.shards.atNode(0, () =>
      docs.run(founded.platform, reading.spaces, DocTreeReader.SLUGS, this.docs.repositoryUrl),
    );
    return {
      platform: founded.platform,
      docs: report,
      brokenLinks: reading.broken,
      admin: founded.admin,
    };
  }
}
