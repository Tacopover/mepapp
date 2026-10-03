import { describe, expect, it } from 'vitest';
import { StoreConflictError } from '../errors.js';
import type { ProjectStore } from '../project-store.js';

export function runProjectStoreContract(
  name: string,
  createStore: () => Promise<ProjectStore> | ProjectStore,
): void {
  describe(`${name} (ProjectStore contract)`, () => {
    it('reports status ready', async () => {
      const store = await createStore();
      expect(await store.status()).toBe('ready');
    });

    it('returns undefined for a missing key', async () => {
      const store = await createStore();
      expect(await store.read({ pdfName: 'a.pdf' })).toBeUndefined();
    });

    it('round trips a write', async () => {
      const store = await createStore();
      const { revision } = await store.write({ pdfName: 'a.pdf' }, '{"x":1}');
      expect(await store.read({ pdfName: 'a.pdf' })).toEqual({ json: '{"x":1}', revision });
    });

    it('keeps different pdfName and locationId keys independent', async () => {
      const store = await createStore();
      await store.write({ pdfName: 'a.pdf' }, '"a"');
      await store.write({ pdfName: 'b.pdf' }, '"b"');
      await store.write({ pdfName: 'a.pdf', locationId: 'L1' }, '"a-l1"');
      expect((await store.read({ pdfName: 'a.pdf' }))?.json).toBe('"a"');
      expect((await store.read({ pdfName: 'b.pdf' }))?.json).toBe('"b"');
      expect((await store.read({ pdfName: 'a.pdf', locationId: 'L1' }))?.json).toBe('"a-l1"');
      expect(await store.read({ pdfName: 'a.pdf', locationId: 'L2' })).toBeUndefined();
    });

    it('accepts the current revision and returns a new one', async () => {
      const store = await createStore();
      const first = await store.write({ pdfName: 'a.pdf' }, '1');
      const second = await store.write({ pdfName: 'a.pdf' }, '2', first.revision);
      expect(second.revision).not.toBe(first.revision);
    });

    it('throws StoreConflictError on a stale expectedRevision', async () => {
      const store = await createStore();
      const first = await store.write({ pdfName: 'a.pdf' }, '1');
      await store.write({ pdfName: 'a.pdf' }, '2', first.revision);
      await expect(store.write({ pdfName: 'a.pdf' }, '3', first.revision)).rejects.toBeInstanceOf(
        StoreConflictError,
      );
    });

    it('throws StoreConflictError for an expectedRevision on a missing key', async () => {
      const store = await createStore();
      await expect(store.write({ pdfName: 'a.pdf' }, '1', '1')).rejects.toBeInstanceOf(StoreConflictError);
    });
  });
}
