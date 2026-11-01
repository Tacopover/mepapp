import { describe, expect, it } from 'vitest';
import {
  addRecentBuilding,
  loadRecentBuildings,
  RECENT_BUILDINGS_KEY,
  RECENT_BUILDINGS_MAX,
  removeRecentBuilding,
  saveRecentBuildings,
  type RecentBuilding,
} from './recentBuildings.js';

type FakeStorage = { value: string | null; getItem(key: string): string | null; setItem(key: string, value: string): void };

function fakeStorage(initial?: string): FakeStorage {
  return {
    value: initial ?? null,
    getItem(key) {
      return key === RECENT_BUILDINGS_KEY ? this.value : null;
    },
    setItem(key, value) {
      if (key === RECENT_BUILDINGS_KEY) this.value = value;
    },
  };
}

function entry(n: number): RecentBuilding {
  return { id: `b${n}`, name: `Building ${n}`, location: `/files/b${n}.mepbuilding` };
}

describe('recent buildings storage', () => {
  it('round-trips a saved list', () => {
    const storage = fakeStorage();
    saveRecentBuildings([entry(1), entry(2)], storage);
    expect(loadRecentBuildings(storage)).toEqual([entry(1), entry(2)]);
  });

  it('saves the list as JSON under the v2 key', () => {
    const storage = fakeStorage();
    saveRecentBuildings([entry(1)], storage);
    expect(RECENT_BUILDINGS_KEY).toBe('mepapp.buildings.v2');
    expect(storage.value).toBe(JSON.stringify([entry(1)]));
  });

  it('gives an empty list when nothing is stored', () => {
    expect(loadRecentBuildings(fakeStorage())).toEqual([]);
  });

  it('gives an empty list for text that is not JSON', () => {
    expect(loadRecentBuildings(fakeStorage('{bad'))).toEqual([]);
  });

  it('gives an empty list for a stored JSON object that is not a list', () => {
    expect(loadRecentBuildings(fakeStorage('{"a":1}'))).toEqual([]);
  });

  it('drops entries without string id, name and location', () => {
    const stored = [entry(1), { id: 'x', name: 'no location' }, { id: 2, name: 'n', location: 'l' }, null, 'text'];
    expect(loadRecentBuildings(fakeStorage(JSON.stringify(stored)))).toEqual([entry(1)]);
  });

  it('does not throw when the storage refuses the save', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => saveRecentBuildings([entry(1)], storage)).not.toThrow();
  });
});

describe('recent buildings list', () => {
  it('puts the added entry first', () => {
    expect(addRecentBuilding([entry(1), entry(2)], entry(3))).toEqual([entry(3), entry(1), entry(2)]);
  });

  it('removes an older entry with the same id and keeps the new one first', () => {
    const updated = { id: 'b2', name: 'Renamed', location: '/new.mepbuilding' };
    expect(addRecentBuilding([entry(1), entry(2), entry(3)], updated)).toEqual([updated, entry(1), entry(3)]);
  });

  it('keeps at most RECENT_BUILDINGS_MAX entries and drops the oldest', () => {
    expect(RECENT_BUILDINGS_MAX).toBe(20);
    const full = Array.from({ length: RECENT_BUILDINGS_MAX }, (_, i) => entry(i + 1));
    const result = addRecentBuilding(full, entry(99));
    expect(result).toHaveLength(RECENT_BUILDINGS_MAX);
    expect(result[0]).toEqual(entry(99));
    expect(result.at(-1)).toEqual(entry(RECENT_BUILDINGS_MAX - 1));
  });

  it('does not change the list it is given', () => {
    const list = [entry(1)];
    addRecentBuilding(list, entry(2));
    expect(list).toEqual([entry(1)]);
  });

  it('removes the entry with the given id', () => {
    expect(removeRecentBuilding([entry(1), entry(2), entry(3)], 'b2')).toEqual([entry(1), entry(3)]);
  });

  it('keeps the list when the id is not in it', () => {
    expect(removeRecentBuilding([entry(1)], 'missing')).toEqual([entry(1)]);
  });
});
