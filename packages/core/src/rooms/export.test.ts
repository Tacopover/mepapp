import { describe, expect, it } from 'vitest';
import { buildRoomExportTable, manualRoom, updateRoom, type CustomPropertyDefinition, type Room } from './index.js';

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
    expect(table.headers).toEqual(['Page', 'Number', 'Name', 'Area (m²)', 'Area in drawing (m²)', 'Needs review', 'Source', 'Details', 'Fire rating', 'Occupants']);
    expect(table.customColumnStart).toBe(8);
    expect(table.rows[0]).toEqual([1, '0.1', 'Lobby', 25, 24, false, 'manual', 'Circulation', 'none', 0]);
  });

  it('uses the saved custom value, and the default when the room has none', () => {
    const table = buildRoomExportTable([room('a', { properties: { 'Fire rating': 'REI 60', Occupants: 12 } }), room('b')], CAL, DEFS);
    expect(table.rows.map((r) => r.slice(8))).toEqual([['REI 60', 12], ['none', 0]]);
  });

  it('leaves the area empty without a calibration', () => {
    expect(buildRoomExportTable([room('a')], null, []).rows[0]![3]).toBeNull();
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
