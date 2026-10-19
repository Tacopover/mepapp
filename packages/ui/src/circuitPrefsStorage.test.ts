import { describe, expect, it } from 'vitest';
import {
  CIRCUIT_PREFS_STORAGE_KEY,
  DEFAULT_OWN_CIRCUIT_THRESHOLD,
  DEFAULT_WET_ROOM_TYPE_IDS,
  loadCircuitPrefs,
  saveCircuitPrefs,
} from './circuitPrefsStorage.js';
import type { StorageLike } from './schematicTemplateStorage.js';

function fakeStorage(initial?: string): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      return key === CIRCUIT_PREFS_STORAGE_KEY ? this.value : null;
    },
    setItem(key, value) {
      if (key === CIRCUIT_PREFS_STORAGE_KEY) this.value = value;
    },
  };
}

const DEFAULTS = { wetRoomTypeIds: ['toilet', 'bathroom'], ownCircuitThreshold: 2000 };

describe('circuit preferences storage', () => {
  it('gives the defaults when nothing is stored, as a new list each call', () => {
    const storage = fakeStorage();
    const first = loadCircuitPrefs(storage);
    expect(first).toEqual(DEFAULTS);
    expect(DEFAULT_WET_ROOM_TYPE_IDS).toEqual(['toilet', 'bathroom']);
    expect(DEFAULT_OWN_CIRCUIT_THRESHOLD).toBe(2000);
    first.wetRoomTypeIds.push('kitchen');
    expect(loadCircuitPrefs(storage)).toEqual(DEFAULTS);
    expect(loadCircuitPrefs(undefined)).toEqual(DEFAULTS);
  });

  it('round-trips saved preferences', () => {
    const storage = fakeStorage();
    saveCircuitPrefs(storage, { wetRoomTypeIds: ['kitchen'], ownCircuitThreshold: 1500 });
    expect(loadCircuitPrefs(storage)).toEqual({ wetRoomTypeIds: ['kitchen'], ownCircuitThreshold: 1500 });
  });

  it('gives the defaults for text that is not JSON', () => {
    expect(loadCircuitPrefs(fakeStorage('{bad'))).toEqual(DEFAULTS);
  });

  it('gives the defaults for a stored value that is not an object', () => {
    expect(loadCircuitPrefs(fakeStorage('42'))).toEqual(DEFAULTS);
    expect(loadCircuitPrefs(fakeStorage('null'))).toEqual(DEFAULTS);
  });

  it('gives the default threshold for zero, negative and non-number values, and keeps a good list', () => {
    expect(loadCircuitPrefs(fakeStorage('{"wetRoomTypeIds":["office"],"ownCircuitThreshold":0}'))).toEqual({ wetRoomTypeIds: ['office'], ownCircuitThreshold: 2000 });
    expect(loadCircuitPrefs(fakeStorage('{"wetRoomTypeIds":["office"],"ownCircuitThreshold":-5}'))).toEqual({ wetRoomTypeIds: ['office'], ownCircuitThreshold: 2000 });
    expect(loadCircuitPrefs(fakeStorage('{"wetRoomTypeIds":["office"],"ownCircuitThreshold":"NaN"}'))).toEqual({ wetRoomTypeIds: ['office'], ownCircuitThreshold: 2000 });
  });

  it('gives the default list for a non-array list, and keeps a good threshold', () => {
    expect(loadCircuitPrefs(fakeStorage('{"wetRoomTypeIds":"toilet","ownCircuitThreshold":1200}'))).toEqual({ wetRoomTypeIds: ['toilet', 'bathroom'], ownCircuitThreshold: 1200 });
  });

  it('keeps a stored empty list empty', () => {
    expect(loadCircuitPrefs(fakeStorage('{"wetRoomTypeIds":[],"ownCircuitThreshold":2000}'))).toEqual({ wetRoomTypeIds: [], ownCircuitThreshold: 2000 });
  });

  it('drops non-string entries and duplicates and keeps the order', () => {
    expect(loadCircuitPrefs(fakeStorage('{"wetRoomTypeIds":["a",1,"a",null,"b"]}')).wetRoomTypeIds).toEqual(['a', 'b']);
  });

  it('gives the defaults when the storage read throws', () => {
    const storage: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    };
    expect(loadCircuitPrefs(storage)).toEqual(DEFAULTS);
  });

  it('does not throw when the storage refuses the save', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveCircuitPrefs(storage, DEFAULTS)).not.toThrow();
    expect(() => saveCircuitPrefs(undefined, DEFAULTS)).not.toThrow();
  });
});
