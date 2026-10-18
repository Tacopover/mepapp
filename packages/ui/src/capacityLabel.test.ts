import { describe, expect, it } from 'vitest';
import type { NetworkType } from '@mepapp/core';
import { capacityLabel } from './components/capacityLabel.js';

const types: Pick<NetworkType, 'id' | 'flowUnit'>[] = [
  { id: 'air', flowUnit: 'dm³/s' },
  { id: 'water', flowUnit: 'l/s' },
  { id: 'plain', flowUnit: undefined },
];

describe('capacityLabel', () => {
  it('shows no unit when no port has a segment', () => {
    expect(capacityLabel([{}], types)).toBe('Capacity');
    expect(capacityLabel([{ portSegmentTypes: {} }], types)).toBe('Capacity');
  });

  it('shows the flow unit of the one network type', () => {
    expect(capacityLabel([{ portSegmentTypes: { p1: 'air' } }], types)).toBe('Capacity (dm³/s)');
  });

  it('shows no unit when the type has no flow unit', () => {
    expect(capacityLabel([{ portSegmentTypes: { p1: 'plain' } }], types)).toBe('Capacity');
  });

  it('shows no unit for two network types', () => {
    expect(capacityLabel([{ portSegmentTypes: { p1: 'air', p2: 'water' } }], types)).toBe('Capacity');
  });

  it('shows the unit for two stamps with the same one type', () => {
    const stamps: { portSegmentTypes: Record<string, string> }[] = [{ portSegmentTypes: { p1: 'air' } }, { portSegmentTypes: { p9: 'air' } }];
    expect(capacityLabel(stamps, types)).toBe('Capacity (dm³/s)');
  });

  it('shows no unit for an unknown type id', () => {
    expect(capacityLabel([{ portSegmentTypes: { p1: 'missing' } }], types)).toBe('Capacity');
  });

  it('shows no unit for an empty list', () => {
    expect(capacityLabel([], types)).toBe('Capacity');
  });
});
