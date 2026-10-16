import { describe, expect, it } from 'vitest';
import { routePageProblem } from './route-input.js';

describe('routePageProblem', () => {
  it('gives null for a one-page PDF and for zero pages', () => {
    expect(routePageProblem(1, 'en')).toBeNull();
    expect(routePageProblem(1, 'nl')).toBeNull();
    expect(routePageProblem(0, 'en')).toBeNull();
  });

  it('gives a null for a negative page count', () => {
    expect(routePageProblem(-3, 'en')).toBeNull();
  });

  it('gives an English message with the count for a multi-page PDF', () => {
    expect(routePageProblem(2, 'en')).toBe(
      'This PDF has 2 pages. Route network works on one floor for each PDF file. Split the pages into separate files.',
    );
    expect(routePageProblem(40, 'en')).toContain('40');
  });

  it('gives a Dutch message with the count for a multi-page PDF', () => {
    const message = routePageProblem(40, 'nl');
    expect(message).toContain('40');
    expect(message).toContain("pagina's");
    expect(message).toContain('verdieping');
    expect(message).toContain('Netwerk routeren');
  });

  it('gives null and does not throw for a non-integer or NaN page count', () => {
    expect(routePageProblem(1.5, 'en')).toBeNull();
    expect(routePageProblem(Number.NaN, 'nl')).toBeNull();
    expect(routePageProblem(Number.POSITIVE_INFINITY, 'en')).toBeNull();
  });
});
