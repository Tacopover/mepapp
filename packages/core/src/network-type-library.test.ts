import { describe, expect, it } from 'vitest';
import { NETWORK_TYPE_LIBRARY, flowSenseOf, getNetworkTypeFromLibrary } from './network-type-library.js';
import type { Discipline, FlowSense } from './network.js';

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
      'electrical',
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

describe('flowSense', () => {
  const returnIds = ['return-air', 'exhaust-air', 'sanitary-waste'];
  const supplyIds = NETWORK_TYPE_LIBRARY.map((t) => t.id).filter((id) => !returnIds.includes(id));

  it('gives every library entry a valid flow sense', () => {
    const senses: FlowSense[] = ['supply', 'return'];
    expect(NETWORK_TYPE_LIBRARY).toHaveLength(14);
    for (const type of NETWORK_TYPE_LIBRARY) {
      expect(senses).toContain(type.flowSense);
    }
  });

  it('sets return for the three return ids and supply for the other eleven', () => {
    expect(supplyIds).toHaveLength(11);
    for (const id of returnIds) {
      expect(getNetworkTypeFromLibrary(id)?.flowSense).toBe('return');
    }
    for (const id of supplyIds) {
      expect(getNetworkTypeFromLibrary(id)?.flowSense).toBe('supply');
    }
  });

  it('uses the stored value when it is set', () => {
    expect(flowSenseOf({ id: 'return-air', flowSense: 'supply' })).toBe('supply');
    expect(flowSenseOf({ id: 'supply-air', flowSense: 'return' })).toBe('return');
  });

  it('uses the library value when no value is stored', () => {
    expect(flowSenseOf({ id: 'exhaust-air' })).toBe('return');
    expect(flowSenseOf({ id: 'chilled-water' })).toBe('supply');
    expect(flowSenseOf({ id: 'my-type' })).toBe('supply');
  });

  it('ignores a bad stored value', () => {
    expect(flowSenseOf({ id: 'sanitary-waste', flowSense: 'up' as never })).toBe('return');
    expect(flowSenseOf({ id: 'sanitary-waste', flowSense: 5 as never })).toBe('return');
    expect(flowSenseOf({ id: 'sanitary-waste', flowSense: null as never })).toBe('return');
    expect(flowSenseOf({ id: 'my-type', flowSense: 'up' as never })).toBe('supply');
  });

  it('keeps the stored value on a copy of a library type', () => {
    const copy = { ...getNetworkTypeFromLibrary('exhaust-air')!, id: 'copy-1', name: 'x_copy' };
    expect(flowSenseOf(copy)).toBe('return');
  });
});
