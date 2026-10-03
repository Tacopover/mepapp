import { describe, expect, it } from 'vitest';
import { StoreConflictError } from '../errors.js';
import type { LibrarySourceRecord, LibraryStampRecord, LibraryStore } from '../library-store.js';

function source(id: string): LibrarySourceRecord {
  return { id, name: `Source ${id}`, category: 'terminal', discipline: 'ventilation' };
}

function stamp(id: string, sourceId: string): LibraryStampRecord {
  return {
    id,
    sourceId,
    fileName: `${id}.png`,
    mimeType: 'image/png',
    fileSize: 3,
    fileModified: 1000,
    missingFromFolder: false,
    nativeWidth: 10,
    nativeHeight: 20,
    edits: { label: 'Original' },
  };
}

function blobOf(bytes: number[], type = 'image/png'): Blob {
  return new Blob([new Uint8Array(bytes)], { type });
}

async function bytesOf(blob: Blob | undefined): Promise<number[]> {
  if (!blob) throw new Error('expected a blob');
  return [...new Uint8Array(await blob.arrayBuffer())];
}

export function runLibraryStoreContract(
  name: string,
  createStore: () => Promise<LibraryStore> | LibraryStore,
): void {
  describe(`${name} (LibraryStore contract)`, () => {
    it('reports status ready', async () => {
      const store = await createStore();
      expect(await store.status()).toBe('ready');
    });

    it('round trips sources and stamps', async () => {
      const store = await createStore();
      const { revision: sourceRev } = await store.putSource(source('s1'));
      const { revision: stampRev } = await store.putStamp(stamp('a', 's1'), blobOf([1, 2, 3]));
      expect(await store.listSources()).toEqual([{ ...source('s1'), revision: sourceRev }]);
      expect(await store.listStamps()).toEqual([{ ...stamp('a', 's1'), revision: stampRev }]);
    });

    it('filters listStamps by sourceId', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      await store.putSource(source('s2'));
      await store.putStamp(stamp('a', 's1'), blobOf([1]));
      await store.putStamp(stamp('b', 's2'), blobOf([2]));
      expect((await store.listStamps('s1')).map((s) => s.id)).toEqual(['a']);
      expect((await store.listStamps('s2')).map((s) => s.id)).toEqual(['b']);
      expect(await store.listStamps()).toHaveLength(2);
    });

    it('returns stamp records without a blob field', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      await store.putStamp(stamp('a', 's1'), blobOf([1, 2, 3]));
      const [record] = await store.listStamps();
      expect(record).toBeDefined();
      expect(Object.keys(record as object)).not.toContain('blob');
      expect(Object.values(record as object).some((v) => v instanceof Blob)).toBe(false);
    });

    it('returns the blob bytes and type that were put', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      await store.putStamp(stamp('a', 's1'), blobOf([9, 8, 7], 'image/png'));
      const blob = await store.getStampBlob('a');
      expect(await bytesOf(blob)).toEqual([9, 8, 7]);
      expect(blob?.type).toBe('image/png');
      expect(await store.getStampBlob('missing')).toBeUndefined();
    });

    it('keeps the old blob when putStamp omits the blob', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      const { revision } = await store.putStamp(stamp('a', 's1'), blobOf([1, 2, 3]));
      await store.putStamp({ ...stamp('a', 's1'), revision, edits: { label: 'Changed' } });
      expect(await bytesOf(await store.getStampBlob('a'))).toEqual([1, 2, 3]);
      const [record] = await store.listStamps();
      expect(record?.edits.label).toBe('Changed');
    });

    it('throws StoreConflictError on a stale stamp revision', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      const { revision: first } = await store.putStamp(stamp('a', 's1'), blobOf([1]));
      await store.putStamp({ ...stamp('a', 's1'), revision: first });
      await expect(store.putStamp({ ...stamp('a', 's1'), revision: first })).rejects.toBeInstanceOf(
        StoreConflictError,
      );
    });

    it('throws StoreConflictError on a stale source revision', async () => {
      const store = await createStore();
      const { revision: first } = await store.putSource(source('s1'));
      await store.putSource({ ...source('s1'), revision: first });
      await expect(store.putSource({ ...source('s1'), revision: first })).rejects.toBeInstanceOf(
        StoreConflictError,
      );
    });

    it('overwrites unconditionally when no revision is given', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      await store.putStamp(stamp('a', 's1'), blobOf([1]));
      await store.putStamp({ ...stamp('a', 's1'), edits: { label: 'Second' } });
      const [record] = await store.listStamps();
      expect(record?.edits.label).toBe('Second');
      await store.putSource({ ...source('s1'), name: 'Renamed' });
      expect((await store.listSources())[0]?.name).toBe('Renamed');
    });

    it('returns a new revision on each put', async () => {
      const store = await createStore();
      const r1 = await store.putSource(source('s1'));
      const r2 = await store.putSource(source('s1'));
      expect(r2.revision).not.toBe(r1.revision);
      const s1 = await store.putStamp(stamp('a', 's1'), blobOf([1]));
      const s2 = await store.putStamp(stamp('a', 's1'));
      expect(s2.revision).not.toBe(s1.revision);
    });

    it('rejects putStamp for an unknown source', async () => {
      const store = await createStore();
      await expect(store.putStamp(stamp('a', 'nope'), blobOf([1]))).rejects.toThrow();
    });

    it('removeStamp removes the stamp and its blob', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      await store.putStamp(stamp('a', 's1'), blobOf([1]));
      await store.removeStamp('a');
      expect(await store.listStamps()).toEqual([]);
      expect(await store.getStampBlob('a')).toBeUndefined();
    });

    it('removeSource removes its stamps and blobs and keeps other sources', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      await store.putSource(source('s2'));
      await store.putStamp(stamp('a', 's1'), blobOf([1]));
      await store.putStamp(stamp('b', 's2'), blobOf([2]));
      await store.removeSource('s1');
      expect((await store.listSources()).map((s) => s.id)).toEqual(['s2']);
      expect((await store.listStamps()).map((s) => s.id)).toEqual(['b']);
      expect(await store.getStampBlob('a')).toBeUndefined();
      expect(await bytesOf(await store.getStampBlob('b'))).toEqual([2]);
    });

    it('does not let callers mutate store state through returned records', async () => {
      const store = await createStore();
      await store.putSource(source('s1'));
      await store.putStamp(stamp('a', 's1'), blobOf([1]));
      const [sourceCopy] = await store.listSources();
      const [stampCopy] = await store.listStamps();
      (sourceCopy as LibrarySourceRecord).name = 'Mutated';
      (stampCopy as LibraryStampRecord).edits.label = 'Mutated';
      expect((await store.listSources())[0]?.name).toBe('Source s1');
      expect((await store.listStamps())[0]?.edits.label).toBe('Original');
    });
  });
}
