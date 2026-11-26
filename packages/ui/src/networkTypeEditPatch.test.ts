import { describe, expect, it } from 'vitest';
import { networkTypeEditPatch } from './components/networkTypeEditPatch.js';

const args = (patch: Partial<Parameters<typeof networkTypeEditPatch>[0]> = {}) => ({
  oldName: 'Chilled Water',
  name: 'Chilled Water return',
  color: '#1e6fd9',
  lineWidthPt: 2,
  linePattern: 'solid' as const,
  discipline: 'heatingAndCooling' as const,
  flowSense: 'supply' as const,
  sizing: { flowUnit: '' as const, method: 'none' as const },
  ...patch,
});

describe('networkTypeEditPatch', () => {
  it('puts a return flow direction in the patch', () => {
    expect(networkTypeEditPatch(args({ flowSense: 'return' })).flowSense).toBe('return');
  });

  it('always puts the supply flow direction in the patch', () => {
    expect(networkTypeEditPatch(args({ flowSense: 'supply' }))).toHaveProperty('flowSense', 'supply');
  });

  it('keeps the old name for a blank name', () => {
    expect(networkTypeEditPatch(args({ name: '  ' })).name).toBe('Chilled Water');
  });

  it('trims the name', () => {
    expect(networkTypeEditPatch(args({ name: '  Return air  ' })).name).toBe('Return air');
  });

  it('takes the sizing fields from the draft and keeps their keys for an empty draft', () => {
    const patch = networkTypeEditPatch(args({ sizing: { flowUnit: '', method: 'none' } }));
    expect('flowUnit' in patch).toBe(true);
    expect('sizingMethod' in patch).toBe(true);
    expect(patch.flowUnit).toBeUndefined();
    expect(patch.sizingMethod).toBeUndefined();
  });

  it('takes the sizing fields from a filled draft', () => {
    const patch = networkTypeEditPatch(args({ sizing: { flowUnit: 'kW', method: 'water' } }));
    expect(patch.flowUnit).toBe('kW');
    expect(patch.sizingMethod).toBe('water');
  });

  it('holds exactly the expected keys', () => {
    expect(Object.keys(networkTypeEditPatch(args())).sort()).toEqual(
      ['color', 'discipline', 'flowSense', 'flowUnit', 'linePattern', 'lineWidthPt', 'name', 'sizingMethod'],
    );
  });
});
