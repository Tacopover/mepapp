import { describe, expect, it } from 'vitest';
import { onPage, withPage } from './page-scope.js';

describe('onPage', () => {
  const items = [
    { id: 'a', pageIndex: 0 },
    { id: 'b', pageIndex: 1 },
    { id: 'c', pageIndex: 1 },
    { id: 'd' },
  ];

  it('returns only the items of the page', () => {
    expect(onPage(items, 1).map((i) => i.id)).toEqual(['b', 'c']);
  });

  it('treats an undefined pageIndex as page 0', () => {
    expect(onPage(items, 0).map((i) => i.id)).toEqual(['a', 'd']);
  });

  it('returns an empty list for an empty list', () => {
    expect(onPage([], 0)).toEqual([]);
  });

  it('returns an empty list for a page with no items', () => {
    expect(onPage(items, 5)).toEqual([]);
  });
});

describe('withPage', () => {
  it('sets the page', () => {
    expect(withPage({ id: 'a' }, 3)).toEqual({ id: 'a', pageIndex: 3 });
  });

  it('does not mutate its input', () => {
    const input: { id: string; pageIndex?: number } = { id: 'a', pageIndex: 1 };
    const out = withPage(input, 2);
    expect(input.pageIndex).toBe(1);
    expect(out).not.toBe(input);
    expect(out.pageIndex).toBe(2);
  });
});
