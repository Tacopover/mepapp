import { describe, expect, it } from 'vitest';
import { routePageProblem } from './route-input.js';

describe('routePageProblem', () => {
  it('gives null for a one-page PDF and for zero pages', () => {
    expect(routePageProblem(1)).toBeNull();
    expect(routePageProblem(0)).toBeNull();
  });

  it('gives a null for a negative page count', () => {
    expect(routePageProblem(-3)).toBeNull();
  });

  it('gives an English message with the count for a multi-page PDF', () => {
    expect(routePageProblem(2)).toBe(
      'This PDF has 2 pages. Route network works on one floor for each PDF file. Split the pages into separate files.',
    );
    expect(routePageProblem(40)).toContain('40');
  });

  it('gives null and does not throw for a non-integer or NaN page count', () => {
    expect(routePageProblem(1.5)).toBeNull();
    expect(routePageProblem(Number.NaN)).toBeNull();
    expect(routePageProblem(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
