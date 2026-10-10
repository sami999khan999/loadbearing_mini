import type { StorageGateway } from "../port/index.js";

type Encoder = new () => { encode(input: string): Uint8Array };
type Decoder = new () => { decode(input: Uint8Array): string };

// A queued index job's text, held in the bucket so the job carries a key and not up to
// 100 KB of `noeviction` Redis. Per tenant, so a purge is one prefix.
export class IndexTextStage {
  public static readonly PREFIX = "embedding/";

  public constructor(private readonly storage: StorageGateway) {}

  public static tenantPrefix(organizationId: string): string {
    return `${IndexTextStage.PREFIX}${organizationId}/`;
  }

  // The caller's id, encoded: a `/` in it would add a segment and hide the version.
  public static key(organizationId: string, documentId: string, version: number): string {
    return `${IndexTextStage.tenantPrefix(organizationId)}${encodeURIComponent(documentId)}/${version}.txt`;
  }

  // The request time the key was written at, or null for a key this class did not name.
  public static versionOf(key: string): number | null {
    const match = /\/(\d+)\.txt$/.exec(key);
    return match ? Number(match[1]) : null;
  }

  public async stage(
    organizationId: string,
    documentId: string,
    version: number,
    text: string,
  ): Promise<string> {
    const key = IndexTextStage.key(organizationId, documentId, version);
    const encoder = (globalThis as unknown as { TextEncoder: Encoder }).TextEncoder;
    await this.storage.put(key, new encoder().encode(text), "text/plain; charset=utf-8");
    return key;
  }

  // Null when the object is gone: its job already ran, or the sweep or a purge took it.
  public async read(key: string): Promise<string | null> {
    if (!(await this.storage.exists(key))) return null;
    const decoder = (globalThis as unknown as { TextDecoder: Decoder }).TextDecoder;
    return new decoder().decode(await this.storage.get(key));
  }

  public async release(key: string): Promise<void> {
    await this.storage.delete(key);
  }

  // Deletes keys staged before `before`, walking every page so a full first page of fresh
  // keys cannot hide a stale one behind it.
  public async sweepStale(before: Date): Promise<number> {
    let deleted = 0;
    for await (const page of this.storage.listPages(IndexTextStage.PREFIX)) {
      for (const key of page) {
        const version = IndexTextStage.versionOf(key);
        if (version === null || version >= before.getTime()) continue;
        await this.storage.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }
}
