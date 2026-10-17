import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE_AREA_TYPE_IDS } from '@mepapp/core';
import { loadRouteRoomTypeIds, ROUTE_ROOM_TYPES_STORAGE_KEY, saveRouteRoomTypeIds } from './routeAreaStorage.js';
import type { StorageLike } from './schematicTemplateStorage.js';

function fakeStorage(initial?: string): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      return key === ROUTE_ROOM_TYPES_STORAGE_KEY ? this.value : null;
    },
    setItem(key, value) {
      if (key === ROUTE_ROOM_TYPES_STORAGE_KEY) this.value = value;
    },
  };
}

describe('route room type storage', () => {
  it('gives the default ids when nothing is stored, as a new array each call', () => {
    const storage = fakeStorage();
    const first = loadRouteRoomTypeIds(storage);
    expect(first).toEqual(['corridor', 'shaft']);
    expect(first).toEqual([...DEFAULT_ROUTE_AREA_TYPE_IDS]);
    first.push('office');
    expect(loadRouteRoomTypeIds(storage)).toEqual(['corridor', 'shaft']);
    expect(loadRouteRoomTypeIds(undefined)).toEqual(['corridor', 'shaft']);
  });

  it('gives a stored list back', () => {
    expect(loadRouteRoomTypeIds(fakeStorage('["office","corridor"]'))).toEqual(['office', 'corridor']);
  });

  it('keeps a stored empty list empty', () => {
    expect(loadRouteRoomTypeIds(fakeStorage('[]'))).toEqual([]);
  });

  it('gives the default ids for text that is not JSON', () => {
    expect(loadRouteRoomTypeIds(fakeStorage('{bad'))).toEqual(['corridor', 'shaft']);
  });

  it('gives the default ids for a stored JSON object that is not a list', () => {
    expect(loadRouteRoomTypeIds(fakeStorage('{"a":1}'))).toEqual(['corridor', 'shaft']);
  });

  it('drops non-string entries and doubles and keeps the order', () => {
    expect(loadRouteRoomTypeIds(fakeStorage('["a",1,"a",null,"b"]'))).toEqual(['a', 'b']);
  });

  it('does not throw when the storage refuses the save', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveRouteRoomTypeIds(storage, ['office'])).not.toThrow();
    expect(() => saveRouteRoomTypeIds(undefined, ['office'])).not.toThrow();
  });

  it('round-trips a saved list', () => {
    const storage = fakeStorage();
    saveRouteRoomTypeIds(storage, ['office', 'shaft']);
    expect(loadRouteRoomTypeIds(storage)).toEqual(['office', 'shaft']);
  });

  it('saves the list as JSON under the route room types key', () => {
    const keys: string[] = [];
    const storage: StorageLike = {
      getItem: () => null,
      setItem: (key, value) => {
        keys.push(key);
        expect(value).toBe('["office","shaft"]');
      },
    };
    saveRouteRoomTypeIds(storage, ['office', 'shaft']);
    expect(keys).toEqual(['mepapp.routeRoomTypes.v1']);
    expect(ROUTE_ROOM_TYPES_STORAGE_KEY).toBe('mepapp.routeRoomTypes.v1');
  });
});
