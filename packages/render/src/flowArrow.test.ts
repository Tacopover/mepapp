import { describe, expect, it } from 'vitest';
import { flowArrowEnds } from './flowArrow.js';

describe('flowArrowEnds', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 4 };

  it('runs from the first point to the second for AtoB', () => {
    expect(flowArrowEnds('AtoB', a, b)).toEqual({ from: a, to: b });
  });

  it('runs from the second point to the first for BtoA', () => {
    expect(flowArrowEnds('BtoA', a, b)).toEqual({ from: b, to: a });
  });

  it('gives null for a null direction, so no arrowhead is drawn', () => {
    expect(flowArrowEnds(null, a, b)).toBeNull();
  });
});
