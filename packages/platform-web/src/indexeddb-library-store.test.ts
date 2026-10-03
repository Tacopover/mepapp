import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { LibrarySourceRecord } from '@mepapp/platform';
import { runLibraryStoreContract } from '../../platform/src/contract/library-store.contract.js';
import { IndexedDbLibraryStore } from './indexeddb-library-store.js';

runLibraryStoreContract(
  'IndexedDbLibraryStore',
  () => new IndexedDbLibraryStore({ indexedDB: new IDBFactory() }),
);

function source(id: string): LibrarySourceRecord {
  return { id, name: `Source ${id}`, category: 'terminal', discipline: 'ventilation' };
}

describe('IndexedDbLibraryStore (IndexedDB specifics)', () => {
  it('keeps data across a new store instance on the same database', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbLibraryStore({ indexedDB: factory });
    await first.putSource(source('a'));
    await first.putStamp(
      {
        id: 's1',
        sourceId: 'a',
        fileName: 's1.png',
        mimeType: 'image/png',
        fileSize: 3,
        fileModified: 1,
        missingFromFolder: false,
        nativeWidth: 1,
        nativeHeight: 1,
        edits: {},
      },
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    );
    const second = new IndexedDbLibraryStore({ indexedDB: factory });
    expect((await second.listSources()).map((s) => s.id)).toEqual(['a']);
    const blob = await second.getStampBlob('s1');
    expect(blob?.type).toBe('image/png');
    expect([...new Uint8Array(await blob!.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it('does not repeat revisions after reopening', async () => {
    const factory = new IDBFactory();
    const first = new IndexedDbLibraryStore({ indexedDB: factory });
    const r1 = await first.putSource(source('a'));
    const r2 = await first.putSource(source('b'));
    const second = new IndexedDbLibraryStore({ indexedDB: factory });
    const r3 = await second.putSource(source('c'));
    expect(new Set([r1.revision, r2.revision, r3.revision]).size).toBe(3);
  });

  it('requests persistence once on the first putSource', async () => {
    const persist = vi.fn(async () => true);
    const store = new IndexedDbLibraryStore({
      indexedDB: new IDBFactory(),
      storage: { persisted: async () => false, persist },
    });
    expect(store.capabilities.persistent).toBe(false);
    await store.putSource(source('a'));
    await store.putSource(source('b'));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(store.capabilities.persistent).toBe(true);
  });

  it('does not request persistence when already persisted', async () => {
    const persist = vi.fn(async () => true);
    const store = new IndexedDbLibraryStore({
      indexedDB: new IDBFactory(),
      storage: { persisted: async () => true, persist },
    });
    await store.putSource(source('a'));
    expect(persist).not.toHaveBeenCalled();
    expect(store.capabilities.persistent).toBe(true);
  });

  it('ignores a rejecting persist()', async () => {
    const store = new IndexedDbLibraryStore({
      indexedDB: new IDBFactory(),
      storage: {
        persisted: async () => false,
        persist: async () => {
          throw new Error('denied');
        },
      },
    });
    await expect(store.putSource(source('a'))).resolves.toHaveProperty('revision');
    expect(store.capabilities.persistent).toBe(false);
  });

  it('is unavailable when no IndexedDB exists', async () => {
    const store = new IndexedDbLibraryStore({ indexedDB: null });
    expect(await store.status()).toBe('unavailable');
    expect(await store.requestAccess()).toBe('unavailable');
    await expect(store.listSources()).rejects.toMatchObject({ name: 'StoreUnavailableError' });
  });
});
