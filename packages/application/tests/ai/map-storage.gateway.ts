import { StorageGateway, type StoredObject } from "../../src/port/index.js";

// Bytes in a Map; only what the staging specs touch is real.
export class MapStorageGateway extends StorageGateway {
  public readonly objects = new Map<string, Uint8Array>();

  public put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, body);
    return Promise.resolve({ key, size: body.byteLength, contentType, checksum: key });
  }

  public get(key: string): Promise<Uint8Array> {
    const body = this.objects.get(key);
    return body ? Promise.resolve(body) : Promise.reject(new Error(`missing ${key}`));
  }

  public delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  public exists(key: string): Promise<boolean> {
    return Promise.resolve(this.objects.has(key));
  }

  public list(prefix: string): Promise<readonly string[]> {
    return Promise.resolve([...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort());
  }

  public sizeOf(key: string): Promise<number | null> {
    return Promise.resolve(this.objects.get(key)?.byteLength ?? null);
  }

  public putStream(): Promise<StoredObject> {
    throw new Error("not under test");
  }

  public getStream(): AsyncIterable<Uint8Array> {
    throw new Error("not under test");
  }

  public presignUpload(): Promise<string> {
    throw new Error("not under test");
  }

  public presignDownload(): Promise<string> {
    throw new Error("not under test");
  }
}
