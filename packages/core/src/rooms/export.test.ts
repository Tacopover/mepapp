import { describe, expect, it } from 'vitest';
import { buildRoomExportTable, computeRoomValues, manualRoom, updateRoom, type CustomPropertyDefinition, type Room } from './index.js';

// 1 pt = 25 mm: a 200 pt square is 5 m x 5 m = 25 m2.
const CAL = { pageUnitsPerRealUnit: 0.04 };
const square = (x: number, y: number, s: number) => [
  { x, y },
  { x: x + s, y },
  { x: x + s, y: y + s },
  { x, y: y + s },
];
const room = (id: string, patch: Partial<Room> = {}): Room => ({ ...manualRoom(0, square(0, 0, 200)), id, ...patch });
const DEFS: CustomPropertyDefinition[] = [
  { name: 'Fire rating', kind: 'text', defaultValue: 'none' },
  { name: 'Occupants', kind: 'numeric', defaultValue: '0' },
];

describe('buildRoomExportTable', () => {
  it('writes the fixed columns, then one column per custom property', () => {
    const table = buildRoomExportTable([room('a', { number: '0.1', name: 'Lobby', labelAreaM2: 24, details: ['Circulation'] })], CAL, DEFS);
    expect(table.headers).toEqual([
      'Page', 'Number', 'Name', 'Room type', 'Area (m²)', 'Perimeter (m)', 'Length (m)', 'Width (m)', 'Ceiling height (mm)', 'Ceiling height from', 'Volume (m³)', 'People',
      'Area in drawing (m²)', 'Needs review', 'Source', 'Details', 'Fire rating', 'Occupants',
    ]);
    expect(table.customColumnStart).toBe(16);
    expect(table.rows[0]).toEqual([1, '0.1', 'Lobby', null, 25, null, null, null, null, null, null, null, 24, false, 'manual', 'Circulation', 'none', 0]);
  });

  it('uses the saved custom value, and the default when the room has none', () => {
    const table = buildRoomExportTable([room('a', { properties: { 'Fire rating': 'REI 60', Occupants: 12 } }), room('b')], CAL, DEFS);
    expect(table.rows.map((r) => r.slice(table.customColumnStart))).toEqual([['REI 60', 12], ['none', 0]]);
  });

  it('leaves the area empty without a calibration', () => {
    expect(buildRoomExportTable([room('a')], null, []).rows[0]![4]).toBeNull();
  });

  it('uses the calibration of each room\'s own page', () => {
    const rooms = [room('a'), room('b', { pageIndex: 1 }), room('c', { pageIndex: 2 })];
    const calibrations = new Map([[0, CAL], [1, { pageUnitsPerRealUnit: 0.08 }]]);
    expect(buildRoomExportTable(rooms, (pageIndex) => calibrations.get(pageIndex) ?? null, []).rows.map((r) => r[4])).toEqual([25, 6.25, null]);
  });

  it('writes the room type name, or the id when the name is unknown', () => {
    const rooms = [room('a', { number: '1', roomTypeId: 'toilet', roomTypeSource: 'matched' }), room('b', { number: '2', roomTypeId: 'gone', roomTypeSource: 'user' }), room('c', { number: '3' })];
    const names: Record<string, string> = { toilet: 'Toilet' };
    expect(buildRoomExportTable(rooms, CAL, [], (id) => names[id] ?? null).rows.map((r) => r[3])).toEqual(['Toilet', 'gone', null]);
  });

  it('writes the room values when a resolver gives them', () => {
    const r = room('a', { ceilingHeightMm: 2600, people: 3 });
    const table = buildRoomExportTable([r], CAL, [], undefined, (x) => computeRoomValues(x, CAL, { globalMm: 2700 }, undefined));
    expect(table.rows[0]!.slice(4, 12)).toEqual([25, 20, 5, 5, 2600, 'Room', 65, 3]);
  });

  it('sorts by page, then natural room number, rooms without a number last', () => {
    const rooms = [room('p2', { pageIndex: 1, number: '0.1' }), room('x', { number: null, name: 'Unnumbered' }), room('b', { number: '1.10' }), room('a', { number: '1.2' })];
    expect(buildRoomExportTable(rooms, CAL, []).rows.map((r) => [r[0], r[1]])).toEqual([[1, '1.2'], [1, '1.10'], [1, null], [2, '0.1']]);
  });
});

describe('updateRoom with custom properties', () => {
  it('stores the values and locks the room, so Detect rooms keeps them', () => {
    const before = { ...room('a'), locked: false, source: 'detected' as const };
    const after = updateRoom(before, { properties: { Occupants: 4 } });
    expect(after.properties).toEqual({ Occupants: 4 });
    expect(after.locked).toBe(true);
  });
});
