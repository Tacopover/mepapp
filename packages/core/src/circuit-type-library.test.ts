import { describe, expect, it } from 'vitest';
import type { Circuit, Panel } from './circuit.js';
import { CIRCUIT_TYPE_LIBRARY, getCircuitTypeFromLibrary, getCircuitTypeUsage, validateCircuitTypeFields } from './circuit-type-library.js';

describe('CIRCUIT_TYPE_LIBRARY', () => {
  it('has unique ids', () => {
    const ids = CIRCUIT_TYPE_LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique abbreviations', () => {
    const abbreviations = CIRCUIT_TYPE_LIBRARY.map((t) => t.abbreviation);
    expect(new Set(abbreviations).size).toBe(abbreviations.length);
  });

  it('looks up a known id and misses an unknown one', () => {
    expect(getCircuitTypeFromLibrary('lighting')?.name).toBe('Lighting');
    expect(getCircuitTypeFromLibrary('nonexistent')).toBeUndefined();
  });
});

describe('getCircuitTypeUsage', () => {
  const circuits = [{ id: 'c1', circuitTypeId: 'lighting' }, { id: 'c2', circuitTypeId: 'lighting' }, { id: 'c3' }] as Circuit[];
  const panels = [{ id: 'p1', circuitDefaults: { circuitTypeId: 'lighting' } }, { id: 'p2' }] as Panel[];

  it('counts circuits and panel defaults that reference the type', () => {
    expect(getCircuitTypeUsage('lighting', circuits, panels)).toEqual({ circuitCount: 2, panelCount: 1 });
    expect(getCircuitTypeUsage('hvac', circuits, panels)).toEqual({ circuitCount: 0, panelCount: 0 });
  });
});

describe('validateCircuitTypeFields', () => {
  const fields = { name: 'Pumps', abbreviation: 'PMP', description: '', units: 'W', defaultCapacity: 500 };
  const others = [CIRCUIT_TYPE_LIBRARY[0]!];

  it('accepts valid fields, including a capacity of 0', () => {
    expect(validateCircuitTypeFields(fields, others)).toBeNull();
    expect(validateCircuitTypeFields({ ...fields, defaultCapacity: 0 }, others)).toBeNull();
  });

  it('rejects a blank name, a duplicate name (any case), a blank abbreviation and a bad capacity', () => {
    expect(validateCircuitTypeFields({ ...fields, name: '  ' }, others)).toMatch(/name/i);
    expect(validateCircuitTypeFields({ ...fields, name: ' lighting ' }, others)).toMatch(/another/i);
    expect(validateCircuitTypeFields({ ...fields, abbreviation: '' }, others)).toMatch(/abbreviation/i);
    expect(validateCircuitTypeFields({ ...fields, defaultCapacity: -1 }, others)).toMatch(/capacity/i);
    expect(validateCircuitTypeFields({ ...fields, defaultCapacity: Number.NaN }, others)).toMatch(/capacity/i);
  });
});
