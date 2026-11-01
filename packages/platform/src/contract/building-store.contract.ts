import { describe, expect, it } from 'vitest';
import { StoreConflictError } from '../errors.js';
import type { BuildingStore } from '../building-store.js';

export function runBuildingStoreContract(
  name: string,
  createStore: () => Promise<BuildingStore> | BuildingStore,
): void {
  describe(`${name} (BuildingStore contract)`, () => {
    it('reports status ready', async () => {
      const store = await createStore();
      expect(await store.status()).toBe('ready');
    });

    it('returns undefined when the building file is absent', async () => {
      const store = await createStore();
      expect(await store.read()).toBeUndefined();
    });

    it('round trips a write', async () => {
      const store = await createStore();
      const { revision } = await store.write('{"x":1}');
      expect(await store.read()).toEqual({ json: '{"x":1}', revision });
    });

    it('accepts the current revision and returns a new one', async () => {
      const store = await createStore();
      const first = await store.write('1');
      const second = await store.write('2', first.revision);
      expect(second.revision).not.toBe(first.revision);
    });

    it('throws StoreConflictError on a stale expectedRevision', async () => {
      const store = await createStore();
      const first = await store.write('1');
      await store.write('2', first.revision);
      await expect(store.write('3', first.revision)).rejects.toBeInstanceOf(StoreConflictError);
    });

    it('throws StoreConflictError for an expectedRevision on an absent file', async () => {
      const store = await createStore();
      await expect(store.write('1', '1')).rejects.toBeInstanceOf(StoreConflictError);
    });

    it('returns undefined for a summary of an unknown projectUuid', async () => {
      const store = await createStore();
      expect(await store.readSummary('p-unknown')).toBeUndefined();
    });

    it('round trips a summary write and overwrites it', async () => {
      const store = await createStore();
      await store.writeSummary('p-1', '"first"');
      expect(await store.readSummary('p-1')).toBe('"first"');
      await store.writeSummary('p-1', '"second"');
      expect(await store.readSummary('p-1')).toBe('"second"');
    });

    it('lists summaries empty first and sorted after writes', async () => {
      const store = await createStore();
      expect(await store.listSummaries()).toEqual([]);
      await store.writeSummary('p-b', '"b"');
      await store.writeSummary('p-a', '"a"');
      expect(await store.listSummaries()).toEqual(['p-a', 'p-b']);
    });

    it('keeps the building file revision when a summary is written', async () => {
      const store = await createStore();
      await store.write('1');
      const before = (await store.read())?.revision;
      await store.writeSummary('p-1', '"s"');
      expect((await store.read())?.revision).toBe(before);
    });
  });
}
