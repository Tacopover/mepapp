import { describe, expect, it } from 'vitest';
import { dashArrayOf, shortLabel } from './components/BuildingRisersDiagram.js';

describe('dashArrayOf', () => {
  it('maps each line pattern to its SVG dash array', () => {
    expect(dashArrayOf('solid')).toBeUndefined();
    expect(dashArrayOf('dashed')).toBe('12 6');
    expect(dashArrayOf('dotted')).toBe('2 6');
    expect(dashArrayOf('longDash')).toBe('24 8');
    expect(dashArrayOf('dashDot')).toBe('14 5 2 5');
    expect(dashArrayOf('dashDotDot')).toBe('14 5 2 5 2 5');
  });
});

describe('shortLabel', () => {
  it('removes the word riser before the number', () => {
    expect(shortLabel('Supply air riser 1')).toBe('Supply air 1');
  });

  it('keeps a label without the word riser', () => {
    expect(shortLabel('Supply air')).toBe('Supply air');
  });
});
