import {
  checkRevision,
  summaryFileName,
  type BuildingRef,
  type BuildingStorageKind,
  type BuildingStore,
  type StoreCapabilities,
  type StoreStatus,
} from '@mepapp/platform';

export interface WebBuildingStoreOptions {
  /** Omit for the global indexedDB; pass null for "none". */
  indexedDB?: IDBFactory | null;
  /** Omit to detect: typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'. */
  fileSystemAccess?: boolean;
  dbName?: string; // default 'mepapp-buildings'
}

export interface WebBuildingStores {
  readonly storage: BuildingStorageKind; // 'file' with API; 'browser' without API but with IndexedDB; 'blocked' with neither
  /** Synchronous. With target (a FileSystemFileHandle from saveFileAs/openFile) the handle is saved under ref.id. Without target the store finds the saved handle by ref.id on first use. */
  make(ref: BuildingRef, target?: unknown): BuildingStore;
}

interface StoredFile {
  json: string;
  counter: number;
}

export const DEFAULT_DB_NAME = 'mepapp-buildings';
const DB_VERSION = 2;
const BLOCKED_MESSAGE = 'This browser does not let MepApp keep a building.';
const UNAVAILABLE_MESSAGE = 'IndexedDB is not available';

const FILE_CAPABILITIES: StoreCapabilities = {
  persistent: true,
  needsUserGesture: true,
  shareable: true,
  worksOffline: true,
};

const HIDDEN_CAPABILITIES: StoreCapabilities = {
  persistent: true,
  needsUserGesture: false,
  shareable: false,
  worksOffline: true,
};

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDatabase(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(dbName, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['handles', 'files', 'summaries', 'pdfHandles', 'pdfFolders']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(`Opening IndexedDB "${dbName}" is blocked`));
  });
}

function summaryKey(buildingId: string, projectUuid: string): string {
  summaryFileName(projectUuid);
  return `${buildingId}:${projectUuid}`;
}

export class BuildingDatabase {
  private readonly factory: IDBFactory | undefined;
  private readonly dbName: string;
  private readonly unavailableMessage: string;
  private dbPromise: Promise<IDBDatabase> | undefined;

  constructor(factory: IDBFactory | undefined, dbName: string, unavailableMessage: string) {
    this.factory = factory;
    this.dbName = dbName;
    this.unavailableMessage = unavailableMessage;
  }

  open(): Promise<IDBDatabase> {
    if (!this.factory) {
      return Promise.reject(new Error(this.unavailableMessage));
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

  async run<T>(
    storeName: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    const tx = db.transaction(storeName, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
    const [result] = await Promise.all([request(action(tx.objectStore(storeName))), done]);
    return result;
  }

  async getHandle(buildingId: string): Promise<FileSystemFileHandle | undefined> {
    return this.run<FileSystemFileHandle | undefined>('handles', 'readonly', (store) =>
      store.get(buildingId),
    );
  }

  async putHandle(buildingId: string, handle: FileSystemFileHandle): Promise<void> {
    await this.run('handles', 'readwrite', (store) => store.put(handle, buildingId));
  }

  async getFile(buildingId: string): Promise<StoredFile | undefined> {
    return this.run<StoredFile | undefined>('files', 'readonly', (store) => store.get(buildingId));
  }

  async putFile(buildingId: string, file: StoredFile): Promise<void> {
    await this.run('files', 'readwrite', (store) => store.put(file, buildingId));
  }

  async getSummary(buildingId: string, projectUuid: string): Promise<string | undefined> {
    const key = summaryKey(buildingId, projectUuid);
    return this.run<string | undefined>('summaries', 'readonly', (store) => store.get(key));
  }

  async putSummary(buildingId: string, projectUuid: string, json: string): Promise<void> {
    const key = summaryKey(buildingId, projectUuid);
    await this.run('summaries', 'readwrite', (store) => store.put(json, key));
  }

  async listSummaries(buildingId: string): Promise<string[]> {
    const prefix = `${buildingId}:`;
    const keys = await this.run<IDBValidKey[]>('summaries', 'readonly', (store) =>
      store.getAllKeys(),
    );
    return keys
      .filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))
      .map((key) => key.slice(prefix.length))
      .sort();
  }
}

class HandleBuildingStore implements BuildingStore {
  readonly capabilities = FILE_CAPABILITIES;
  private readonly ref: BuildingRef;
  private readonly db: BuildingDatabase;
  private readonly target: unknown;
  private handlePromise: Promise<FileSystemFileHandle | undefined> | undefined;

  constructor(ref: BuildingRef, db: BuildingDatabase, target: unknown) {
    this.ref = ref;
    this.db = db;
    this.target = target;
    if (target !== undefined) void this.resolveHandle();
  }

  async status(): Promise<StoreStatus> {
    const handle = await this.resolveHandle();
    if (!handle) return 'unavailable';
    if (!handle.queryPermission) return 'ready';
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    return permission === 'granted' ? 'ready' : 'needs-permission';
  }

  async requestAccess(): Promise<StoreStatus> {
    try {
      const handle = await this.resolveHandle();
      if (handle?.requestPermission) {
        await handle.requestPermission({ mode: 'readwrite' });
      }
      return await this.status();
    } catch {
      return 'needs-permission';
    }
  }

  async read(): Promise<{ json: string; revision: string } | undefined> {
    const handle = await this.resolveHandle();
    if (!handle) return undefined;
    let file: File;
    try {
      file = await handle.getFile();
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') return undefined;
      throw error;
    }
    if (file.size === 0) return undefined;
    return { json: await file.text(), revision: `${file.lastModified}:${file.size}` };
  }

  async write(json: string, expectedRevision?: string): Promise<{ revision: string }> {
    const handle = await this.resolveHandle();
    if (!handle) throw new Error('The building file was not found.');
    const current = await this.read();
    checkRevision(this.ref.name, expectedRevision, current?.revision);
    const writable = await handle.createWritable();
    await writable.write(json);
    await writable.close();
    const written = await this.read();
    if (written === undefined) {
      throw new Error(`Building file "${this.ref.name}" is missing after a write`);
    }
    return { revision: written.revision };
  }

  readSummary(projectUuid: string): Promise<string | undefined> {
    return this.db.getSummary(this.ref.id, projectUuid);
  }

  writeSummary(projectUuid: string, json: string): Promise<void> {
    return this.db.putSummary(this.ref.id, projectUuid, json);
  }

  listSummaries(): Promise<string[]> {
    return this.db.listSummaries(this.ref.id);
  }

  private resolveHandle(): Promise<FileSystemFileHandle | undefined> {
    if (!this.handlePromise) {
      this.handlePromise = this.loadHandle();
    }
    return this.handlePromise;
  }

  private loadHandle(): Promise<FileSystemFileHandle | undefined> {
    if (this.target !== undefined) {
      const handle = this.target as FileSystemFileHandle;
      return this.db.putHandle(this.ref.id, handle).then(
        () => handle,
        () => handle,
      );
    }
    return this.db.getHandle(this.ref.id).catch(() => undefined);
  }
}

class HiddenBuildingStore implements BuildingStore {
  readonly capabilities = HIDDEN_CAPABILITIES;
  private readonly ref: BuildingRef;
  private readonly db: BuildingDatabase;

  constructor(ref: BuildingRef, db: BuildingDatabase) {
    this.ref = ref;
    this.db = db;
  }

  async status(): Promise<StoreStatus> {
    try {
      await this.db.open();
      return 'ready';
    } catch {
      return 'unavailable';
    }
  }

  async requestAccess(): Promise<StoreStatus> {
    return this.status();
  }

  async read(): Promise<{ json: string; revision: string } | undefined> {
    const file = await this.db.getFile(this.ref.id);
    return file === undefined ? undefined : { json: file.json, revision: String(file.counter) };
  }

  async write(json: string, expectedRevision?: string): Promise<{ revision: string }> {
    const current = await this.db.getFile(this.ref.id);
    checkRevision(this.ref.name, expectedRevision, current && String(current.counter));
    const counter = (current?.counter ?? 0) + 1;
    await this.db.putFile(this.ref.id, { json, counter });
    return { revision: String(counter) };
  }

  readSummary(projectUuid: string): Promise<string | undefined> {
    return this.db.getSummary(this.ref.id, projectUuid);
  }

  writeSummary(projectUuid: string, json: string): Promise<void> {
    return this.db.putSummary(this.ref.id, projectUuid, json);
  }

  listSummaries(): Promise<string[]> {
    return this.db.listSummaries(this.ref.id);
  }
}

export function createWebBuildingStores(options: WebBuildingStoreOptions = {}): WebBuildingStores {
  const dbName = options.dbName ?? DEFAULT_DB_NAME;
  const factory: IDBFactory | undefined =
    options.indexedDB === undefined ? globalThis.indexedDB : (options.indexedDB ?? undefined);
  const fileSystemAccess =
    options.fileSystemAccess ??
    (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function');
  const storage: BuildingStorageKind = fileSystemAccess
    ? 'file'
    : factory
      ? 'browser'
      : 'blocked';
  const db = new BuildingDatabase(
    factory,
    dbName,
    storage === 'blocked' ? BLOCKED_MESSAGE : UNAVAILABLE_MESSAGE,
  );
  return {
    storage,
    make(ref, target) {
      return storage === 'file'
        ? new HandleBuildingStore(ref, db, target)
        : new HiddenBuildingStore(ref, db);
    },
  };
}
