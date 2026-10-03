import { checkRevision } from '../revision.js';
import type {
  LibrarySourceRecord,
  LibraryStampRecord,
  LibraryStore,
} from '../library-store.js';
import type { StoreStatus } from '../store.js';
import { MEMORY_CAPABILITIES } from './memory-capabilities.js';

function cloneSource(source: LibrarySourceRecord): LibrarySourceRecord {
  const { dirHandle, ...rest } = source;
  const copy: LibrarySourceRecord = structuredClone(rest);
  if (dirHandle !== undefined) copy.dirHandle = dirHandle;
  return copy;
}

export class MemoryLibraryStore implements LibraryStore {
  readonly capabilities = MEMORY_CAPABILITIES;
  private counter = 0;
  private readonly sources = new Map<string, LibrarySourceRecord>();
  private readonly stamps = new Map<string, LibraryStampRecord>();
  private readonly blobs = new Map<string, Blob>();

  async status(): Promise<StoreStatus> {
    return 'ready';
  }

  async requestAccess(): Promise<StoreStatus> {
    return 'ready';
  }

  private nextRevision(): string {
    this.counter += 1;
    return String(this.counter);
  }

  async listSources(): Promise<LibrarySourceRecord[]> {
    return [...this.sources.values()].map(cloneSource);
  }

  async putSource(source: LibrarySourceRecord): Promise<{ revision: string }> {
    checkRevision(source.id, source.revision, this.sources.get(source.id)?.revision);
    const revision = this.nextRevision();
    this.sources.set(source.id, cloneSource({ ...source, revision }));
    return { revision };
  }

  async removeSource(sourceId: string): Promise<void> {
    this.sources.delete(sourceId);
    for (const stamp of [...this.stamps.values()]) {
      if (stamp.sourceId === sourceId) {
        this.stamps.delete(stamp.id);
        this.blobs.delete(stamp.id);
      }
    }
  }

  async listStamps(sourceId?: string): Promise<LibraryStampRecord[]> {
    return [...this.stamps.values()]
      .filter((stamp) => sourceId === undefined || stamp.sourceId === sourceId)
      .map((stamp) => structuredClone(stamp));
  }

  async getStampBlob(stampId: string): Promise<Blob | undefined> {
    return this.blobs.get(stampId);
  }

  async putStamp(record: LibraryStampRecord, blob?: Blob): Promise<{ revision: string }> {
    if (!this.sources.has(record.sourceId)) {
      throw new Error(`Unknown library source "${record.sourceId}"`);
    }
    checkRevision(record.id, record.revision, this.stamps.get(record.id)?.revision);
    const revision = this.nextRevision();
    this.stamps.set(record.id, structuredClone({ ...record, revision }));
    if (blob !== undefined) this.blobs.set(record.id, blob);
    return { revision };
  }

  async removeStamp(stampId: string): Promise<void> {
    this.stamps.delete(stampId);
    this.blobs.delete(stampId);
  }
}
