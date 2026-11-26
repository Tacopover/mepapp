import { describe, expect, it } from 'vitest';
import type { NetworkType } from '@mepapp/core';
import { applyNetworkTypePatch } from './networkTypePatch.js';

function makeType(overrides: Partial<NetworkType> = {}): NetworkType {
  return {
    id: 'supply-air',
    name: 'Supply air',
    discipline: 'ventilation',
    units: 'CFM',
    defaultCapacity: 0,
    color: '#2196f3',
    lineWidthPt: 1,
    linePattern: 'solid',
    ...overrides,
  };
}

describe('applyNetworkTypePatch', () => {
  it('writes a color change and asks for a redraw', () => {
    const target = makeType();
    expect(applyNetworkTypePatch(target, { color: '#ff0000' })).toBe(true);
    expect(target.color).toBe('#ff0000');
  });

  it('stores flowSense without a redraw', () => {
    const target = makeType();
    expect(applyNetworkTypePatch(target, { flowSense: 'return' })).toBe(false);
    expect(target.flowSense).toBe('return');
  });

  it('removes flowSense when the patch value is undefined', () => {
    const target = makeType({ flowSense: 'return' });
    expect(applyNetworkTypePatch(target, { flowSense: undefined })).toBe(false);
    expect('flowSense' in target).toBe(false);
  });

  it('stores flowUnit and sizingMethod without a redraw', () => {
    const target = makeType();
    expect(applyNetworkTypePatch(target, { flowUnit: 'm³/h', sizingMethod: 'air' })).toBe(false);
    expect(target.flowUnit).toBe('m³/h');
    expect(target.sizingMethod).toBe('air');
  });

  it('removes flowUnit when the patch value is undefined', () => {
    const target = makeType({ flowUnit: 'm³/h' });
    expect(applyNetworkTypePatch(target, { flowUnit: undefined })).toBe(false);
    expect('flowUnit' in target).toBe(false);
  });

  it('stores a mixed patch and asks for a redraw', () => {
    const target = makeType();
    expect(applyNetworkTypePatch(target, { name: 'x', flowSense: 'supply' })).toBe(true);
    expect(target.name).toBe('x');
    expect(target.flowSense).toBe('supply');
  });

  it('keeps an existing flowSense when the patch has no flowSense key', () => {
    const target = makeType({ flowSense: 'return' });
    expect(applyNetworkTypePatch(target, { name: 'Exhaust air' })).toBe(true);
    expect(target.flowSense).toBe('return');
  });

  it('changes nothing and returns false for an empty patch', () => {
    const target = makeType({ flowSense: 'return' });
    const before = JSON.stringify(target);
    expect(applyNetworkTypePatch(target, {})).toBe(false);
    expect(JSON.stringify(target)).toBe(before);
  });
});
