import { describe, expect, it } from 'vitest';
import { NETWORK_TYPE_LIBRARY, getNetworkTypeFromLibrary } from './network-type-library.js';
import type { Discipline } from './network.js';

describe('NETWORK_TYPE_LIBRARY', () => {
  it('has unique ids', () => {
    const ids = NETWORK_TYPE_LIBRARY.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every discipline', () => {
    const disciplines: Discipline[] = [
      'heatingAndCooling',
      'ventilation',
      'plumbing',
      'fireProtection',
      'electricalPathways',
      'electricalCircuits',
    ];
    for (const discipline of disciplines) {
      expect(NETWORK_TYPE_LIBRARY.some((t) => t.discipline === discipline)).toBe(true);
    }
  });

  it('looks up a known id and misses an unknown one', () => {
    expect(getNetworkTypeFromLibrary('supply-air')?.name).toBe('Supply Air');
    expect(getNetworkTypeFromLibrary('nonexistent')).toBeUndefined();
  });
});
