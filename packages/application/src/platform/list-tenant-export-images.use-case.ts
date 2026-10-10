import type { OrganizationId } from "../import.js";
import type { StorageGateway } from "../port/index.js";
import type { Authorizer, Principal } from "../primitive/index.js";

export interface TenantExportImage {
  // The key below the export's day, `doc-image/<space>/<file>`: where it goes on disk.
  readonly path: string;
  readonly url: string;
}

export interface ListTenantExportImagesInput {
  readonly organizationId: OrganizationId;
  readonly day: string;
}

// An hour, not the list's fifteen minutes: thousands of images take a while to fetch, and
// the links go into a file an operator runs a loop over rather than clicks.
const EXPIRES_IN = 3_600;

// One export's copied doc images, which `ListTenantExportsUseCase` leaves to the manifest.
// The screen saves them as a links file; a zip of gigabytes is not a web request.
export class ListTenantExportImagesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly storage: StorageGateway,
  ) {}

  public async execute(
    actor: Principal,
    input: ListTenantExportImagesInput,
  ): Promise<readonly TenantExportImage[]> {
    this.authorizer.assert(actor, "platform.tenant.manage");

    const day = `export/${input.organizationId}/${input.day}/`;
    const images: TenantExportImage[] = [];
    for await (const page of this.storage.listPages(`${day}doc-image/`)) {
      for (const key of page) {
        images.push({
          path: key.slice(day.length),
          url: await this.storage.presignDownload(key, EXPIRES_IN),
        });
      }
    }
    return images;
  }
}
