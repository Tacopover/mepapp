import { describe, expect, it } from 'vitest';
import { BUILT_IN_NEEDS, demandTotal, type RoomNeed } from '@mepapp/core';
import { calcKey, calcLabel, calcsOfKind, DemandTextError, demandDraftOf, demandOfDraft, demandShort, demandSumText, newDemandDraft } from './components/roomDemandText.js';
import { loadRoomNeeds, ROOM_NEEDS_STORAGE_KEY, saveRoomNeeds } from './roomNeedStorage.js';

const need = (id: string) => BUILT_IN_NEEDS.find((n) => n.id === id)!;

describe('room demand texts', () => {
  it('lists the calculations of a kind, "1 per N" after its basis', () => {
    expect(calcsOfKind('count').map(calcKey)).toEqual(['person', 'person:every', 'room', 'area', 'area:every', 'length', 'length:every']);
    expect(calcsOfKind('flow').map(calcLabel)).toEqual(['per person', 'per m² floor area', 'per room', 'air changes per hour']);
    expect(calcsOfKind('light').map(calcKey)).toEqual(['illuminance']);
  });

  it('gives the short text of a cell', () => {
    expect(demandShort({ terms: [{ basis: 'person', value: 6.5 }, { basis: 'area', value: 0.7 }], minimum: 7 })).toBe('6.5/person + 0.7/m² ≥ 7');
    expect(demandShort({ terms: [{ basis: 'length', every: 15 }] })).toBe('1 per 15 m');
    expect(demandShort({ terms: [{ basis: 'person', every: 4 }] })).toBe('1 per 4 persons');
    expect(demandShort({ terms: [{ basis: 'volume', value: 0.5 }] })).toBe('0.5 air changes/h');
    expect(demandShort({ terms: [{ basis: 'illuminance', value: 500 }], workingPlaneM: 0.75 })).toBe('500 lx');
  });

  it('gives the sum of a room', () => {
    const values = { areaM2: 32.5, lengthM: 7.3, volumeM3: 87.75, people: { count: 3, source: 'roomType' as const } };
    expect(demandSumText(need('supplyAir'), demandTotal(need('supplyAir'), { terms: [{ basis: 'person', value: 6.5 }, { basis: 'room', value: 5 }] }, values))).toBe('6.5 × 3 persons + 5 dm³/s per room');
    expect(demandSumText(need('sockets'), demandTotal(need('sockets'), { terms: [{ basis: 'length', every: 15 }] }, values))).toBe('7.3 m ÷ 15');
    expect(demandSumText(need('returnAir'), demandTotal(need('returnAir'), { terms: [{ basis: 'volume', value: 2 }] }, values))).toBe('2 × 87.75 m³ = 175.5 m³/h');
    expect(demandSumText(need('light'), demandTotal(need('light'), { terms: [{ basis: 'illuminance', value: 500 }] }, values))).toBe('500 lx × 32.5 m²');
    expect(demandSumText(need('light'), demandTotal(need('light'), { terms: [{ basis: 'illuminance', value: 500 }] }, { ...values, areaM2: 50.359 }))).toBe('500 lx × 50.36 m²');
  });

  it('turns a demand into boxes and back', () => {
    const demand = { terms: [{ basis: 'person' as const, value: 4 }, { basis: 'area' as const, every: 10 }], minimum: 2 };
    const draft = demandDraftOf(demand);
    expect(draft).toEqual({ terms: [{ key: 'person', text: '4' }, { key: 'area:every', text: '10' }], minimum: '2', workingPlane: '' });
    expect(demandOfDraft(need('sockets'), draft)).toEqual(demand);
    expect(demandOfDraft(need('light'), { terms: [{ key: 'illuminance', text: '300' }], minimum: '5', workingPlane: '0,85' })).toEqual({ terms: [{ basis: 'illuminance', value: 300 }], workingPlaneM: 0.85 });
    expect(demandOfDraft(need('heating'), { terms: [{ key: 'area', text: '' }], minimum: '', workingPlane: '' })).toEqual({ terms: [{ basis: 'area' }] });
    expect(() => demandOfDraft(need('heating'), { terms: [{ key: 'area', text: 'abc' }], minimum: null, workingPlane: '' })).toThrow(DemandTextError);
    expect(newDemandDraft(need('light'))).toEqual({ terms: [{ key: 'illuminance', text: '' }], minimum: null, workingPlane: '' });
    expect(newDemandDraft(need('heating')).terms[0]!.key).toBe('area');
  });
});

describe('room need storage', () => {
  it('saves and loads the own needs, and gives none for a bad value', () => {
    const map = new Map<string, string>();
    const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
    expect(loadRoomNeeds(storage)).toEqual([]);
    const own: RoomNeed[] = [{ id: 'need-data', name: 'Data outlets', kind: 'count', unit: 'outlets', own: true }];
    saveRoomNeeds(storage, own);
    expect(loadRoomNeeds(storage)).toEqual(own);
    map.set(ROOM_NEEDS_STORAGE_KEY, '{bad');
    expect(loadRoomNeeds(storage)).toEqual([]);
  });
});
