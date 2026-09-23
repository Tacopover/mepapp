import { describe, expect, it } from 'vitest';
import { CIRCUIT_TYPE_LIBRARY, getCircuitTypeFromLibrary } from './circuit-type-library.js';

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
