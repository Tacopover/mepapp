import type { PdfHandleStore } from '@mepapp/platform';
import { BuildingDatabase, DEFAULT_DB_NAME } from './web-building-store.js';

export interface WebPdfHandleStoreOptions {
  /** Omit for the global indexedDB; pass null for "none". */
  indexedDB?: IDBFactory | null;
  /** Omit to detect: typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'. */
  handleSupport?: boolean;
  dbName?: string; // default 'mepapp-buildings'
}

const FILES = 'pdfHandles';
const FOLDERS = 'pdfFolders';
const UNAVAILABLE_MESSAGE = 'PDF handles are not available';

// An array key [buildingId, fileKey] cannot clash across buildings, whatever characters the ids hold.
function isKeyOf(buildingId: string, key: IDBValidKey): key is [string, string] {
  return (
    Array.isArray(key) && key.length === 2 && key[0] === buildingId && typeof key[1] === 'string'
  );
}

class WebPdfHandleStore implements PdfHandleStore {
  readonly available: boolean;
  private readonly db: BuildingDatabase;

  constructor(available: boolean, db: BuildingDatabase) {
    this.available = available;
    this.db = db;
  }

  // A database that cannot open (blocked, private profile) acts as "no handles": the app behaves as without this store.
  private async safe<T>(fallback: T, action: () => Promise<T>): Promise<T> {
    if (!this.available) return fallback;
    try {
      return await action();
    } catch {
      return fallback;
    }
  }

  putFile(buildingId: string, fileKey: string, handle: unknown): Promise<void> {
    return this.safe(undefined, async () => {
      await this.db.run(FILES, 'readwrite', (store) => store.put(handle, [buildingId, fileKey]));
    });
  }

  getFile(buildingId: string, fileKey: string): Promise<unknown | undefined> {
    return this.safe<unknown | undefined>(undefined, () =>
      this.db.run<unknown>(FILES, 'readonly', (store) => store.get([buildingId, fileKey])),
    );
  }

  deleteFile(buildingId: string, fileKey: string): Promise<void> {
    return this.safe(undefined, async () => {
      await this.db.run(FILES, 'readwrite', (store) => store.delete([buildingId, fileKey]));
    });
  }

  listFiles(buildingId: string): Promise<string[]> {
    return this.safe<string[]>([], async () => {
      const keys = await this.db.run<IDBValidKey[]>(FILES, 'readonly', (store) =>
        store.getAllKeys(),
      );
      return keys
        .filter((key): key is [string, string] => isKeyOf(buildingId, key))
        .map((key) => key[1])
        .sort();
    });
  }

  putFolder(buildingId: string, handle: unknown): Promise<void> {
    return this.safe(undefined, async () => {
      await this.db.run(FOLDERS, 'readwrite', (store) => store.put(handle, buildingId));
    });
  }

  getFolder(buildingId: string): Promise<unknown | undefined> {
    return this.safe<unknown | undefined>(undefined, () =>
      this.db.run<unknown>(FOLDERS, 'readonly', (store) => store.get(buildingId)),
    );
  }

  deleteFolder(buildingId: string): Promise<void> {
    return this.safe(undefined, async () => {
      await this.db.run(FOLDERS, 'readwrite', (store) => store.delete(buildingId));
    });
  }

  async deleteBuilding(buildingId: string): Promise<void> {
    for (const fileKey of await this.listFiles(buildingId)) {
      await this.deleteFile(buildingId, fileKey);
    }
    await this.deleteFolder(buildingId);
  }
}

export function createWebPdfHandleStore(options: WebPdfHandleStoreOptions = {}): PdfHandleStore {
  const factory: IDBFactory | undefined =
    options.indexedDB === undefined ? globalThis.indexedDB : (options.indexedDB ?? undefined);
  const handleSupport =
    options.handleSupport ??
    (typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function');
  const db = new BuildingDatabase(factory, options.dbName ?? DEFAULT_DB_NAME, UNAVAILABLE_MESSAGE);
  return new WebPdfHandleStore(handleSupport && factory !== undefined, db);
}
