import { describe, expect, it } from 'vitest';
import { PLACEMENT_RULE_EXAMPLES } from '@mepapp/core';
import {
  clearRuleMoveReport,
  loadPlacementRules,
  loadRuleMoveReport,
  loadUncheckedRuleIds,
  moveStoredOldRules,
  PLACEMENT_RULES_BACKUP_KEY,
  PLACEMENT_RULES_STORAGE_KEY,
  RULE_MOVE_FAILED,
  savePlacementRules,
  saveUncheckedRuleIds,
} from './placementRuleStorage.js';
import { ROOM_TYPES_STORAGE_KEY } from './roomTypeStorage.js';
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

describe('the one-time move of old rules', () => {
  const memory = (entries: Record<string, string>) => {
    const map = new Map(Object.entries(entries));
    return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  };
  // The supply air example as the app stored it before room-type-calculations.md, and an old socket rule with two links.
  const oldRules = [
    { id: 'example-supply-air', name: 'Supply air per person + area (example)', discipline: 'ventilation', roomTypeIds: ['office', 'meeting'], stampDefinitionId: null, preset: 'perPersonArea', amount: { perPerson: 7, perM2: 0.7, unit: 'dm³/s' }, capacityPerElement: 50, coverage: {}, layout: { strategy: 'grid', wallOffsetM: 0.5, rotation: 'room' }, writeCapacity: true },
    { id: 'sockets', name: 'Double socket', discipline: 'electrical', roomTypeIds: ['office'], stampDefinitionId: null, preset: 'custom', amount: { unit: 'sockets', from: { perPerson: 'socketsPerPerson', fixed: 'socketsFixed' } }, capacityPerElement: 2, coverage: {}, layout: { strategy: 'evenSpread', wallOffsetM: 0.3, rotation: 'room' }, writeCapacity: false },
  ];
  const oldTypes = [
    { id: 'office', name: 'Office', keywords: [], areaPerPersonM2: 10, demands: { supplyPerPersonDm3s: 6.5, socketsPerPerson: 4 } },
    { id: 'meeting', name: 'Meeting room', keywords: [] },
  ];

  it('moves the numbers, keeps a backup, saves the new shape and a report; a second call does nothing', () => {
    const storage = memory({ [PLACEMENT_RULES_STORAGE_KEY]: JSON.stringify(oldRules), [ROOM_TYPES_STORAGE_KEY]: JSON.stringify(oldTypes) });
    const report = moveStoredOldRules(storage);
    expect(report).toHaveLength(2);
    expect(report![1]).toBe('Supply air per person + area (example): now serves Supply air. Its numbers moved to Meeting room. Office kept its own numbers. MepApp chose the demand type Supply air from the unit dm³/s and the rule name.');
    expect(storage.map.get(PLACEMENT_RULES_BACKUP_KEY)).toBe(JSON.stringify(oldRules));
    const types = JSON.parse(storage.map.get(ROOM_TYPES_STORAGE_KEY)!);
    expect(types[0].demands.supplyAir).toEqual({ terms: [{ basis: 'person', value: 6.5 }] });
    expect(types[1].demands.supplyAir).toEqual({ terms: [{ basis: 'person', value: 7 }, { basis: 'area', value: 0.7 }] });
    const rules = loadPlacementRules(storage);
    expect(rules.map((r) => [r.countBy, r.needId])).toEqual([['need', 'supplyAir'], ['need', 'sockets']]);
    expect(loadRuleMoveReport(storage)).toEqual(report);
    expect(moveStoredOldRules(storage)).toBeNull();
    clearRuleMoveReport(storage);
    expect(loadRuleMoveReport(storage)).toBeNull();
  });

  it('a full storage: the old rules stay, the report says so, and no save writes over them', () => {
    const storage = memory({ [PLACEMENT_RULES_STORAGE_KEY]: JSON.stringify(oldRules), [ROOM_TYPES_STORAGE_KEY]: JSON.stringify(oldTypes) });
    const full = {
      getItem: storage.getItem,
      setItem: (k: string, v: string) => {
        if (k === PLACEMENT_RULES_BACKUP_KEY) throw new Error('QuotaExceededError');
        storage.setItem(k, v);
      },
    };
    expect(moveStoredOldRules(full)).toEqual([RULE_MOVE_FAILED]);
    expect(storage.map.get(PLACEMENT_RULES_STORAGE_KEY)).toBe(JSON.stringify(oldRules));
    expect(JSON.parse(storage.map.get(ROOM_TYPES_STORAGE_KEY)!)).toEqual(oldTypes);
    const rules = loadPlacementRules(full);
    expect(rules.map((r) => r.id)).toEqual(['example-supply-air', 'sockets']);
    savePlacementRules(full, rules);
    expect(storage.map.get(PLACEMENT_RULES_STORAGE_KEY)).toBe(JSON.stringify(oldRules));
    // The next start, with space: the move runs.
    expect(moveStoredOldRules(storage)).toHaveLength(2);
  });

  it('does nothing for rules of the new shape or no rules', () => {
    expect(moveStoredOldRules(memory({}))).toBeNull();
    const storage = memory({ [PLACEMENT_RULES_STORAGE_KEY]: JSON.stringify(PLACEMENT_RULE_EXAMPLES) });
    expect(moveStoredOldRules(storage)).toBeNull();
    expect(storage.map.has(PLACEMENT_RULES_BACKUP_KEY)).toBe(false);
  });
});

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
