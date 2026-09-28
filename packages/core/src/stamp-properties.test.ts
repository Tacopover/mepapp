import { describe, expect, it } from 'vitest';
import type { Circuit, CircuitType, Panel } from './circuit.js';
import type { GlobalPropertyDefs } from './custom-properties.js';
import type { PlacedStamp } from './stamp.js';
import {
  buildStampPropertyContext,
  formatCircuitCable,
  formatCircuitDevice,
  formatPropertyNumber,
  listStampPropertyKeys,
  resolveStampProperty,
  resolveStampPropertyValue,
  type StampPropertyContextInput,
} from './stamp-properties.js';

function stamp(id: string, category: PlacedStamp['category'], extra: Partial<PlacedStamp> = {}): PlacedStamp {
  return {
    id,
    category,
    transform: { position: { x: 0, y: 0 }, rotationDegrees: 90, scale: { x: 1, y: 1 } },
    nativeWidth: 10,
    nativeHeight: 10,
    ports: [],
    ...extra,
  };
}

const defs: GlobalPropertyDefs = {
  terminal: [{ name: 'Room', kind: 'text', defaultValue: 'TBD' }, { name: 'Power', kind: 'numeric', defaultValue: '0' }],
  equipment: [{ name: 'Brand', kind: 'text', defaultValue: '' }],
  circuit: [{ name: 'Group', kind: 'text', defaultValue: 'G0' }],
};

const types: CircuitType[] = [{ id: 'ct-light', name: 'Lighting', abbreviation: 'VL', description: '', units: 'W', defaultCapacity: 0 }];

const panel: Panel = {
  id: 'p1',
  equipmentStampId: 'eq1',
  name: 'Panel A',
  sortDirection: 'ascending',
  accessories: [],
  sectionIds: [],
  circuitDefaults: { prefix: 'L1.', circuitTypeId: 'ct-light', device: { kind: 'breaker', curve: 'B', ratingA: 16 }, cable: { type: 'YMvK', coreCount: 3 } },
};

const circuit: Circuit = {
  id: 'c1',
  number: 3,
  panelId: 'p1',
  terminalIds: ['t1'],
  isSpare: false,
  customName: 'Lights hall',
  cable: { crossSectionMm2: 2.5, lengthM: 12 },
  properties: { Group: 'G7' },
};

function context(overrides: Partial<StampPropertyContextInput> = {}) {
  return buildStampPropertyContext({
    customStampDefinitions: [],
    terminalCapacities: { t1: 12.25 },
    circuits: [circuit],
    panels: [panel],
    circuitTypes: types,
    customPropertyDefs: defs,
    labelLanguage: 'en',
    ...overrides,
  });
}

describe('stamp property keys', () => {
  it('gives circuit keys to terminals only and the panel name to equipment only', () => {
    const ctx = context();
    const terminalKeys = listStampPropertyKeys(ctx, 'terminal').map((k) => k.key);
    const equipmentKeys = listStampPropertyKeys(ctx, 'equipment').map((k) => k.key);
    expect(terminalKeys).toContain('circuit:label');
    expect(terminalKeys).toContain('circuit:custom:Group');
    expect(terminalKeys).toContain('custom:Room');
    expect(terminalKeys).not.toContain('panel:name');
    expect(equipmentKeys).toContain('panel:name');
    expect(equipmentKeys).toContain('custom:Brand');
    expect(equipmentKeys.some((k) => k.startsWith('circuit:'))).toBe(false);
    expect(listStampPropertyKeys(ctx, 'fitting').map((k) => k.key)).toEqual(['stamp:name', 'stamp:rotation']);
  });
});

describe('resolving stamp values', () => {
  it('reads the name from the definition in the chosen language', () => {
    const s = stamp('t1', 'terminal', { definitionId: 'fire-hose-reel' });
    expect(resolveStampProperty(context(), s, 'stamp:name')).toBe('D4 Fire Hose Reel');
    expect(resolveStampProperty(context({ labelLanguage: 'nl' }), s, 'stamp:name')).toBe('53 Brandslanghaspel');
    expect(resolveStampProperty(context(), stamp('x', 'terminal'), 'stamp:name')).toBeNull();
  });

  it('formats capacity and rotation numbers', () => {
    const s = stamp('t1', 'terminal');
    expect(resolveStampProperty(context(), s, 'stamp:capacity')).toBe('12.3');
    expect(resolveStampProperty(context(), s, 'stamp:rotation')).toBe('90');
  });

  it('falls back to the definition default for an unset custom property and returns null for an unknown one', () => {
    const s = stamp('t1', 'terminal', { properties: { Power: 60 } });
    expect(resolveStampProperty(context(), s, 'custom:Power')).toBe('60');
    expect(resolveStampProperty(context(), s, 'custom:Room')).toBe('TBD');
    expect(resolveStampProperty(context(), s, 'custom:Gone')).toBeNull();
    expect(resolveStampProperty(context(), stamp('eq2', 'equipment'), 'custom:Brand')).toBeNull();
  });

  it('derives circuit values, including panel defaults, for a terminal in a circuit', () => {
    const ctx = context();
    const s = stamp('t1', 'terminal');
    expect(resolveStampProperty(ctx, s, 'circuit:label')).toBe('L1.3');
    expect(resolveStampProperty(ctx, s, 'circuit:number')).toBe('3');
    expect(resolveStampPropertyValue(ctx, s, 'circuit:prefix')).toEqual({ value: 'L1.', inherited: true });
    expect(resolveStampProperty(ctx, s, 'circuit:name')).toBe('Lights hall');
    expect(resolveStampProperty(ctx, s, 'circuit:panel')).toBe('Panel A');
    expect(resolveStampPropertyValue(ctx, s, 'circuit:type')).toEqual({ value: 'VL', inherited: true });
    expect(resolveStampProperty(ctx, s, 'circuit:phase')).toBeNull();
    expect(resolveStampPropertyValue(ctx, s, 'circuit:device')).toEqual({ value: 'B16', inherited: true });
    expect(resolveStampPropertyValue(ctx, s, 'circuit:cable')).toEqual({ value: 'YMvK 3G2.5', inherited: true });
    expect(resolveStampProperty(ctx, s, 'circuit:custom:Group')).toBe('G7');
  });

  it('marks a circuit value as its own when the circuit overrides the panel default', () => {
    const ctx = context({ circuits: [{ ...circuit, prefix: 'X', phase: 'L2' }] });
    const s = stamp('t1', 'terminal');
    expect(resolveStampPropertyValue(ctx, s, 'circuit:prefix')).toEqual({ value: 'X', inherited: false });
    expect(resolveStampProperty(ctx, s, 'circuit:label')).toBe('X3');
    expect(resolveStampPropertyValue(ctx, s, 'circuit:phase')).toEqual({ value: 'L2', inherited: false });
  });

  it('returns null circuit values for a terminal outside any circuit and for a non-terminal', () => {
    const ctx = context();
    expect(resolveStampProperty(ctx, stamp('t9', 'terminal'), 'circuit:label')).toBeNull();
    expect(resolveStampProperty(ctx, stamp('eq1', 'equipment'), 'circuit:label')).toBeNull();
  });

  it('returns no panel for an unassigned circuit', () => {
    const ctx = context({ circuits: [{ ...circuit, panelId: undefined }] });
    const s = stamp('t1', 'terminal');
    expect(resolveStampProperty(ctx, s, 'circuit:label')).toBe('3');
    expect(resolveStampProperty(ctx, s, 'circuit:panel')).toBeNull();
  });

  it('gives the panel name to the equipment stamp under the panel only', () => {
    const ctx = context();
    expect(resolveStampProperty(ctx, stamp('eq1', 'equipment'), 'panel:name')).toBe('Panel A');
    expect(resolveStampProperty(ctx, stamp('eq2', 'equipment'), 'panel:name')).toBeNull();
  });
});

describe('value formatting', () => {
  it('shows integers without decimals and other numbers with one', () => {
    expect(formatPropertyNumber(4)).toBe('4');
    expect(formatPropertyNumber(4.26)).toBe('4.3');
  });

  it('formats devices', () => {
    expect(formatCircuitDevice({ kind: 'breaker', curve: 'C', ratingA: 20, rcdMilliamps: 30 })).toBe('C20 30 mA');
    expect(formatCircuitDevice({ kind: 'other', ratingA: 25 })).toBe('25 A');
    expect(formatCircuitDevice({ kind: 'breaker' })).toBe('Breaker');
    expect(formatCircuitDevice(undefined)).toBeNull();
  });

  it('formats cables without the length', () => {
    expect(formatCircuitCable({ type: 'XMvK', coreCount: 5, crossSectionMm2: 4, lengthM: 30 })).toBe('XMvK 5G4');
    expect(formatCircuitCable({ crossSectionMm2: 1.5 })).toBe('1.5 mm²');
    expect(formatCircuitCable({ lengthM: 10 })).toBeNull();
  });
});
