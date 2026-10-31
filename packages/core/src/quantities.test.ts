import { describe, expect, it } from 'vitest';
import { calibrationFromScale } from './calibration.js';
import type { Segment } from './network.js';
import { buildQuantityTables } from './quantities.js';

const type = { id: 't', name: 'Supply air', discipline: 'hvac', units: 'l/s', defaultCapacity: 0, color: '#000', lineWidthPt: 1, linePattern: 'solid' } as never;

const segment = (id: string, pageIndex: number, geometry: { x: number; y: number }[]): Segment => ({
  id,
  pageIndex,
  networkTypeId: 't',
  shape: 'round',
  diameter: 200,
  endpointA: { kind: 'free', position: geometry[0]! } as never,
  endpointB: { kind: 'free', position: geometry[geometry.length - 1]! } as never,
  geometry,
});

const base = {
  fittings: [],
  portGroups: [],
  stamps: [],
  networkTypes: [type],
  circuits: [],
  panels: [],
  capacities: {},
  stampTypeName: () => null,
  stampImageName: () => null,
};

describe('buildQuantityTables', () => {
  it('gives the length in metres from the page calibration', () => {
    const calibration = calibrationFromScale(100);
    const pageLength = 1000 * calibration.pageUnitsPerRealUnit; // 1 m of real length
    const result = buildQuantityTables({
      ...base,
      segments: [segment('s1', 0, [{ x: 0, y: 0 }, { x: pageLength, y: 0 }])],
      calibrationOf: () => calibration,
    });
    const table = result.tables[0]!;
    expect(table.name).toBe('Segments');
    expect(table.rows[0]![table.headers.indexOf('Length (m)')]).toBe(1);
    expect(result.warnings).toEqual([]);
  });

  it('leaves the length blank and warns when the page has no scale', () => {
    const result = buildQuantityTables({
      ...base,
      segments: [segment('s1', 1, [{ x: 0, y: 0 }, { x: 50, y: 0 }])],
      calibrationOf: () => null,
    });
    const table = result.tables[0]!;
    expect(table.rows[0]![table.headers.indexOf('Length (m)')]).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('Page 2');
  });

  it('leaves out empty tables and adds custom property columns', () => {
    const stamp = {
      id: 'e1',
      category: 'equipment',
      transform: { position: { x: 10.456, y: 20 }, rotationDegrees: 90, scale: { x: 1.5, y: 1.5 } },
      nativeWidth: 1,
      nativeHeight: 1,
      ports: [],
      definitionId: 'd',
      properties: { Brand: 'Acme', Id: 'x' },
    } as never;
    const result = buildQuantityTables({ ...base, segments: [], stamps: [stamp], calibrationOf: () => null, stampTypeName: () => 'AHU', stampImageName: () => 'ahu.svg' });
    expect(result.tables.map((t) => t.name)).toEqual(['Equipment']);
    const table = result.tables[0]!;
    expect(table.headers).toEqual(['Id', 'Type', 'Capacity', 'X (pt)', 'Y (pt)', 'Rotation (°)', 'Scale', 'Image', 'Brand', 'Id (custom)']);
    expect(table.rows[0]).toEqual(['e1', 'AHU', 0, 10.46, 20, 90, 1.5, 'ahu.svg', 'Acme', 'x']);
  });
});
