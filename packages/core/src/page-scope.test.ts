import { describe, expect, it } from 'vitest';
import { onPage, pasteOnPage, withPage } from './page-scope.js';

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

describe('pasteOnPage', () => {
  const items = {
    stamps: [
      { id: 's1', pageIndex: 0 },
      { id: 's2', pageIndex: 2 },
    ],
    segments: [{ id: 'g1', pageIndex: 2 }],
    fittings: [
      { id: 'f1', pageIndex: 0 },
      { id: 'f2', pageIndex: 2 },
    ],
    annotations: [{ id: 'a1', pageIndex: 2 }],
  };

  it('puts every item on the target page and keeps the counts', () => {
    const out = pasteOnPage(items, 1);
    expect(out.stamps.map((i) => i.pageIndex)).toEqual([1, 1]);
    expect(out.segments.map((i) => i.pageIndex)).toEqual([1]);
    expect(out.fittings.map((i) => i.pageIndex)).toEqual([1, 1]);
    expect(out.annotations.map((i) => i.pageIndex)).toEqual([1]);
    expect(out.stamps.map((i) => i.id)).toEqual(['s1', 's2']);
    expect(out.segments.map((i) => i.id)).toEqual(['g1']);
    expect(out.fittings.map((i) => i.id)).toEqual(['f1', 'f2']);
    expect(out.annotations.map((i) => i.id)).toEqual(['a1']);
  });

  it('does not mutate its inputs', () => {
    const before = JSON.stringify(items);
    const out = pasteOnPage(items, 1);
    expect(JSON.stringify(items)).toBe(before);
    expect(out.stamps[0]).not.toBe(items.stamps[0]);
  });

  it('accepts empty lists', () => {
    const out = pasteOnPage({ stamps: [], segments: [], fittings: [], annotations: [] }, 3);
    expect(out).toEqual({ stamps: [], segments: [], fittings: [], annotations: [] });
  });

  it('sets a pageIndex on an item that has none', () => {
    const out = pasteOnPage({ stamps: [{ id: 's' }], segments: [], fittings: [], annotations: [] }, 4);
    expect(out.stamps).toEqual([{ id: 's', pageIndex: 4 }]);
  });
});
