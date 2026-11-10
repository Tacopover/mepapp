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

  it('keeps millimetre precision and leaves a one-point segment blank', () => {
    const calibration = calibrationFromScale(100);
    const result = buildQuantityTables({
      ...base,
      segments: [segment('s1', 0, [{ x: 0, y: 0 }, { x: 4.4 * calibration.pageUnitsPerRealUnit, y: 0 }]), segment('s2', 0, [{ x: 0, y: 0 }])],
      calibrationOf: () => calibration,
    });
    const table = result.tables[0]!;
    const column = table.headers.indexOf('Length (m)');
    expect(table.rows[0]![column]).toBe(0.004);
    expect(table.rows[1]![column]).toBeNull();
  });

  it('shows the circuit of a terminal and the panel of an equipment stamp', () => {
    const stamp = (id: string, category: string) =>
      ({ id, category, transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 1, nativeHeight: 1, ports: [] }) as never;
    const result = buildQuantityTables({
      ...base,
      segments: [],
      stamps: [stamp('t1', 'terminal'), stamp('p1', 'equipment')],
      circuits: [{ id: 'c', number: 3, terminalIds: ['t1'], isSpare: false, prefix: 'A' } as never],
      panels: [{ id: 'pn', equipmentStampId: 'p1', name: 'Main board' } as never],
      calibrationOf: () => null,
    });
    const terminals = result.tables.find((t) => t.name === 'Terminals')!;
    const equipment = result.tables.find((t) => t.name === 'Equipment')!;
    expect(terminals.rows[0]![terminals.headers.indexOf('Circuit')]).toBe('A3');
    expect(terminals.rows[0]![terminals.headers.indexOf('Type')]).toBeNull();
    expect(equipment.rows[0]![equipment.headers.indexOf('Panel')]).toBe('Main board');
  });

  it('leaves out empty tables and adds custom property columns', () => {
    const stamp = {
      id: 'e1',
      category: 'equipment',
      transform: { position: { x: 10.456, y: 20 }, rotationDegrees: 90, scale: { x: 1.5, y: 1.5 } },
      nativeWidth: 1,
      nativeHeight: 1,
      pageIndex: 0,
      ports: [],
      definitionId: 'd',
      properties: { Brand: 'Acme', Id: 'x' },
    } as never;
    const result = buildQuantityTables({ ...base, segments: [], stamps: [stamp], calibrationOf: () => null, stampTypeName: () => 'AHU', stampImageName: () => 'ahu.svg' });
    expect(result.tables.map((t) => t.name)).toEqual(['Equipment']);
    const table = result.tables[0]!;
    expect(table.headers).toEqual(['Page', 'Id', 'Type', 'Capacity', 'Panel', 'X (pt)', 'Y (pt)', 'Rotation (°)', 'Size (%)', 'Image', 'Brand', 'Id (custom)']);
    expect(table.rows[0]).toEqual([1, 'e1', 'AHU', null, null, 10.46, 20, 90, 150, 'ahu.svg', 'Acme', 'x']);
  });

  it('shows the page of each terminal and equipment stamp', () => {
    const stamp = (id: string, category: string) =>
      ({ id, category, transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 1, nativeHeight: 1, pageIndex: 1, ports: [] }) as never;
    const result = buildQuantityTables({
      ...base,
      segments: [],
      stamps: [stamp('t1', 'terminal'), stamp('e1', 'equipment')],
      calibrationOf: () => null,
    });
    const terminals = result.tables.find((t) => t.name === 'Terminals')!;
    const equipment = result.tables.find((t) => t.name === 'Equipment')!;
    expect(terminals.headers[0]).toBe('Page');
    expect(terminals.rows[0]![0]).toBe(2);
    expect(equipment.headers[0]).toBe('Page');
    expect(equipment.rows[0]![0]).toBe(2);
  });

  it('lists the start fitting and the end fitting of a segment, null for a port end', () => {
    const fitting = { id: 'f1', pageIndex: 0, position: { x: 1000, y: 0 }, kind: 'junction' } as never;
    const connected: Segment = {
      id: 's1',
      pageIndex: 0,
      networkTypeId: 't',
      shape: 'round',
      diameter: 200,
      endpointA: { kind: 'fitting', fittingId: 'f1' },
      endpointB: { kind: 'port', elementId: 'diffuser', portId: 'p' },
      geometry: [{ x: 1000, y: 0 }, { x: 0, y: 0 }],
    };
    const result = buildQuantityTables({ ...base, segments: [connected], fittings: [fitting], calibrationOf: () => null });
    const table = result.tables.find((t) => t.name === 'Segments')!;
    expect(table.headers.slice(-2)).toEqual(['Start fitting', 'End fitting']);
    expect(table.rows[0]!.slice(-2)).toEqual(['f1', null]);
  });

  describe('page filter', () => {
    const fitting = (id: string, pageIndex: number) => ({ id, pageIndex, position: { x: 1000, y: 0 }, kind: 'junction' }) as never;
    const pagedSegment = (id: string, pageIndex: number, fittingId: string): Segment => ({
      id,
      pageIndex,
      networkTypeId: 't',
      shape: 'round',
      diameter: 200,
      endpointA: { kind: 'port', elementId: `${id}-start`, portId: 'p' },
      endpointB: { kind: 'fitting', fittingId },
      geometry: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
    });
    const pagedStamp = (id: string, category: string, pageIndex: number) =>
      ({ id, category, pageIndex, transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } }, nativeWidth: 1, nativeHeight: 1, ports: [] }) as never;
    const twoPages = {
      ...base,
      segments: [pagedSegment('s0', 0, 'f0'), pagedSegment('s1', 1, 'f1')],
      fittings: [fitting('f0', 0), fitting('f1', 1)],
      stamps: [pagedStamp('t0', 'terminal', 0), pagedStamp('t1', 'terminal', 1), pagedStamp('e0', 'equipment', 0), pagedStamp('e1', 'equipment', 1)],
      circuits: [{ id: 'c', number: 3, terminalIds: ['t0', 't1'], isSpare: false, prefix: 'A' } as never],
      calibrationOf: () => null,
    };

    it('keeps only the rows of the chosen pages in every table', () => {
      const result = buildQuantityTables({ ...twoPages, pages: new Set([1]) });
      expect(result.tables.map((t) => t.name)).toEqual(['Segments', 'Terminals', 'Equipment', 'Fittings']);
      const ids = result.tables.map((t) => [t.name, t.rows.length, t.rows[0]![0], t.rows[0]![1]]);
      expect(ids).toEqual([
        ['Segments', 1, 2, 's1'],
        ['Terminals', 1, 2, 't1'],
        ['Equipment', 1, 2, 'e1'],
        ['Fittings', 1, 2, 'f1'],
      ]);
    });

    it('restarts the network numbers on the chosen pages', () => {
      const kept = buildQuantityTables({ ...twoPages, pages: new Set([1]) });
      const segmentsKept = kept.tables.find((t) => t.name === 'Segments')!;
      const fittingsKept = kept.tables.find((t) => t.name === 'Fittings')!;
      expect(segmentsKept.rows[0]![segmentsKept.headers.indexOf('Network')]).toBe('Supply air 1');
      expect(fittingsKept.rows[0]![fittingsKept.headers.indexOf('Network')]).toBe('Supply air 1');

      const all = buildQuantityTables(twoPages);
      const segmentsAll = all.tables.find((t) => t.name === 'Segments')!;
      const column = segmentsAll.headers.indexOf('Network');
      expect(segmentsAll.rows.map((row) => row[column])).toEqual(['Supply air 1', 'Supply air 2']);
    });

    it('keeps the circuit label of a terminal on a kept page', () => {
      const result = buildQuantityTables({ ...twoPages, pages: new Set([1]) });
      const terminals = result.tables.find((t) => t.name === 'Terminals')!;
      expect(terminals.rows[0]![terminals.headers.indexOf('Circuit')]).toBe('A3');
    });

    it('counts every page when no page set is given', () => {
      const result = buildQuantityTables(twoPages);
      expect(result.tables.map((t) => t.rows.length)).toEqual([2, 2, 2, 2]);
    });

    it('warns only about a kept page without a scale', () => {
      const result = buildQuantityTables({ ...twoPages, pages: new Set([1]) });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Page 2');
    });
  });
});
