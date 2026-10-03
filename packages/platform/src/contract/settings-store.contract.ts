import { describe, expect, it } from 'vitest';
import type { SettingsStore } from '../settings-store.js';

export function runSettingsStoreContract(
  name: string,
  createStore: () => Promise<SettingsStore> | SettingsStore,
): void {
  describe(`${name} (SettingsStore contract)`, () => {
    it('reports status ready', async () => {
      const store = await createStore();
      expect(await store.status()).toBe('ready');
    });

    it('returns undefined for a missing key', async () => {
      const store = await createStore();
      expect(await store.get('mepapp.missing')).toBeUndefined();
    });

    it('sets, gets, and removes a value', async () => {
      const store = await createStore();
      await store.set('mepapp.a', '{"v":1}');
      expect(await store.get('mepapp.a')).toBe('{"v":1}');
      await store.set('mepapp.a', '2');
      expect(await store.get('mepapp.a')).toBe('2');
      await store.remove('mepapp.a');
      expect(await store.get('mepapp.a')).toBeUndefined();
    });

    it('filters keys by prefix', async () => {
      const store = await createStore();
      await store.set('mepapp.ui.a', '1');
      await store.set('mepapp.ui.b', '2');
      await store.set('mepapp.other', '3');
      expect((await store.keys('mepapp.ui.')).sort()).toEqual(['mepapp.ui.a', 'mepapp.ui.b']);
      expect(await store.keys()).toHaveLength(3);
    });

    it('rejects a key without the mepapp. prefix', async () => {
      const store = await createStore();
      await expect(store.set('other.key', '1')).rejects.toThrow();
    });
  });
}
