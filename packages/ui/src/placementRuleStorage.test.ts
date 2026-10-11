import { describe, expect, it } from 'vitest';
import { loadUncheckedRuleIds, saveUncheckedRuleIds } from './placementRuleStorage.js';
import type { StorageLike } from './schematicTemplateStorage.js';

function fakeStorage(initial?: string): StorageLike & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() {
      return this.value;
    },
    setItem(_key, value) {
      this.value = value;
    },
  };
}

describe('unchecked rule storage', () => {
  it('round-trips the ids', () => {
    const storage = fakeStorage();
    saveUncheckedRuleIds(storage, ['a', 'b']);
    expect(loadUncheckedRuleIds(storage)).toEqual(['a', 'b']);
  });

  it('gives an empty list when nothing is stored', () => {
    expect(loadUncheckedRuleIds(fakeStorage())).toEqual([]);
    expect(loadUncheckedRuleIds(undefined)).toEqual([]);
  });

  it('ignores a value that is not a list of ids', () => {
    expect(loadUncheckedRuleIds(fakeStorage('{bad'))).toEqual([]);
    expect(loadUncheckedRuleIds(fakeStorage('{"a":1}'))).toEqual([]);
    expect(loadUncheckedRuleIds(fakeStorage('["a",2,null]'))).toEqual(['a']);
  });
});
