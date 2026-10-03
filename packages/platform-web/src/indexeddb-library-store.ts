import {
  StoreUnavailableError,
  checkRevision,
  type LibrarySourceRecord,
  type LibraryStampRecord,
  type LibraryStore,
  type StoreCapabilities,
  type StoreStatus,
} from '@mepapp/platform';

export interface IndexedDbLibraryStoreOptions {
  dbName?: string;
  /** Omit for the global indexedDB; pass null for "no IndexedDB available". */
  indexedDB?: IDBFactory | null;
  storage?: Pick<StorageManager, 'persist' | 'persisted'>;
}

interface StoredBlob {
  type: string;
  bytes: ArrayBuffer;
}

const DEFAULT_DB_NAME = 'mepapp-library';
const REVISION_KEY = 'revisionCounter';

const MIGRATIONS: Array<(db: IDBDatabase, tx: IDBTransaction) => void> = [
  (db) => {
    db.createObjectStore('sources', { keyPath: 'id' });
    const stamps = db.createObjectStore('stamps', { keyPath: 'id' });
    stamps.createIndex('bySourceId', 'sourceId');
    db.createObjectStore('blobs');
    db.createObjectStore('meta');
  },
];

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(dbName, MIGRATIONS.length);
    req.onupgradeneeded = (event) => {
      const tx = req.transaction;
      if (!tx) return;
      for (let version = event.oldVersion; version < MIGRATIONS.length; version += 1) {
        MIGRATIONS[version]!(req.result, tx);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`Opening IndexedDB "${dbName}" is blocked`));
  });
}

export class IndexedDbLibraryStore implements LibraryStore {
  private readonly dbName: string;
  private readonly factory: IDBFactory | undefined;
  private readonly storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined;
  private dbPromise: Promise<IDBDatabase> | undefined;
  private persistRequested = false;
  private persistent = false;

  constructor(options: IndexedDbLibraryStoreOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.factory =
      options.indexedDB === null ? undefined : (options.indexedDB ?? globalThis.indexedDB);
    this.storage = options.storage ?? globalThis.navigator?.storage;
  }

  get capabilities(): StoreCapabilities {
    return {
      persistent: this.persistent,
      needsUserGesture: false,
      shareable: false,
      worksOffline: true,
    };
  }

  async status(): Promise<StoreStatus> {
    if (!this.factory) return 'unavailable';
    try {
      await this.open();
      return 'ready';
    } catch {
      return 'unavailable';
    }
  }

  async requestAccess(): Promise<StoreStatus> {
    return this.status();
  }

  private open(): Promise<IDBDatabase> {
    if (!this.factory) {
      return Promise.reject(new StoreUnavailableError('IndexedDB is not available'));
    }
    if (!this.dbPromise) {
      const promise = openDatabase(this.factory, this.dbName).then((db) => {
        db.onversionchange = () => {
          db.close();
          if (this.dbPromise === promise) this.dbPromise = undefined;
        };
        return db;
      });
      promise.catch(() => {
        if (this.dbPromise === promise) this.dbPromise = undefined;
      });
      this.dbPromise = promise;
    }
    return this.dbPromise;
  }

  private async read<T>(storeNames: string[], fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await this.open();
    return fn(db.transaction(storeNames, 'readonly'));
  }

  private async write<T>(storeNames: string[], fn: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(storeNames, 'readwrite');
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    done.catch(() => {});
    let result: T;
    try {
      result = await fn(tx);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // the transaction already finished
      }
      throw error;
    }
    await done;
    return result;
  }

  private async nextRevision(tx: IDBTransaction): Promise<string> {
    const meta = tx.objectStore('meta');
    const current = ((await request(meta.get(REVISION_KEY))) as number | undefined) ?? 0;
    const next = current + 1;
    await request(meta.put(next, REVISION_KEY));
    return String(next);
  }

  private async requestPersistence(): Promise<void> {
    if (this.persistRequested || !this.storage) return;
    this.persistRequested = true;
    try {
      if (await this.storage.persisted()) {
        this.persistent = true;
        return;
      }
      this.persistent = await this.storage.persist();
    } catch {
      // persistence is best effort
    }
  }

  async listSources(): Promise<LibrarySourceRecord[]> {
    return this.read(['sources'], (tx) =>
      request(tx.objectStore('sources').getAll() as IDBRequest<LibrarySourceRecord[]>),
    );
  }

  async putSource(source: LibrarySourceRecord): Promise<{ revision: string }> {
    const result = await this.write(['sources', 'meta'], async (tx) => {
      const store = tx.objectStore('sources');
      const stored = (await request(store.get(source.id))) as LibrarySourceRecord | undefined;
      checkRevision(source.id, source.revision, stored?.revision);
      const revision = await this.nextRevision(tx);
      await request(store.put({ ...source, revision }));
      return { revision };
    });
    await this.requestPersistence();
    return result;
  }

  async removeSource(sourceId: string): Promise<void> {
    await this.write(['sources', 'stamps', 'blobs'], async (tx) => {
      const stamps = tx.objectStore('stamps');
      const blobs = tx.objectStore('blobs');
      const stampIds = (await request(
        stamps.index('bySourceId').getAllKeys(sourceId),
      )) as IDBValidKey[];
      for (const stampId of stampIds) {
        await request(stamps.delete(stampId));
        await request(blobs.delete(stampId));
      }
      await request(tx.objectStore('sources').delete(sourceId));
    });
  }

  async listStamps(sourceId?: string): Promise<LibraryStampRecord[]> {
    return this.read(['stamps'], (tx) => {
      const stamps = tx.objectStore('stamps');
      const req =
        sourceId === undefined ? stamps.getAll() : stamps.index('bySourceId').getAll(sourceId);
      return request(req as IDBRequest<LibraryStampRecord[]>);
    });
  }

  async getStampBlob(stampId: string): Promise<Blob | undefined> {
    const stored = await this.read(['blobs'], (tx) =>
      request(tx.objectStore('blobs').get(stampId) as IDBRequest<StoredBlob | undefined>),
    );
    return stored ? new Blob([stored.bytes], { type: stored.type }) : undefined;
  }

  async putStamp(record: LibraryStampRecord, blob?: Blob): Promise<{ revision: string }> {
    const stored: StoredBlob | undefined = blob
      ? { type: blob.type, bytes: await blob.arrayBuffer() }
      : undefined;
    return this.write(['sources', 'stamps', 'blobs', 'meta'], async (tx) => {
      const knownSource = await request(tx.objectStore('sources').getKey(record.sourceId));
      if (knownSource === undefined) {
        throw new Error(`Unknown library source "${record.sourceId}"`);
      }
      const stamps = tx.objectStore('stamps');
      const existing = (await request(stamps.get(record.id))) as LibraryStampRecord | undefined;
      checkRevision(record.id, record.revision, existing?.revision);
      const revision = await this.nextRevision(tx);
      await request(stamps.put({ ...record, revision }));
      if (stored) await request(tx.objectStore('blobs').put(stored, record.id));
      return { revision };
    });
  }

  async removeStamp(stampId: string): Promise<void> {
    await this.write(['stamps', 'blobs'], async (tx) => {
      await request(tx.objectStore('stamps').delete(stampId));
      await request(tx.objectStore('blobs').delete(stampId));
    });
  }
}
