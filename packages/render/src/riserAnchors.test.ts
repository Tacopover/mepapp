import { describe, expect, it } from 'vitest';
import type { Segment } from '@mepapp/core';
import { anchorAtPoint, anchorRefusalText, decideAnchorEnd, visibleRiserAnchors, type RiserAnchor } from './riserAnchors.js';

function segment(id: string, networkTypeId: string): Segment {
  return { id, pageIndex: 0, networkTypeId } as Segment;
}

const supply: RiserAnchor = { riserId: 'r1', label: 'Supply air riser 1', networkTypeId: 'supply', networkTypeName: 'Supply air', anchorPt: { x: 100, y: 100 } };
const extract: RiserAnchor = { riserId: 'r2', label: 'Extract air riser 1', networkTypeId: 'extract', networkTypeName: 'Extract air', anchorPt: { x: 300, y: 100 } };

describe('riser anchors', () => {
  it('hides the ring when no segment has the anchor type', () => {
    expect(visibleRiserAnchors([supply], [])).toEqual([]);
  });

  it('shows the ring when one segment has the anchor type', () => {
    expect(visibleRiserAnchors([supply], [segment('s1', 'supply')])).toEqual([supply]);
  });

  it('hides the ring when only another type exists', () => {
    expect(visibleRiserAnchors([supply], [segment('s1', 'extract')])).toEqual([]);
  });

  it('keeps the order of the anchors', () => {
    const result = visibleRiserAnchors([extract, supply], [segment('s1', 'supply'), segment('s2', 'extract')]);
    expect(result).toEqual([extract, supply]);
  });

  it('returns the nearest anchor of two', () => {
    expect(anchorAtPoint({ x: 120, y: 100 }, [supply, extract], 50)).toBe(supply);
    expect(anchorAtPoint({ x: 280, y: 100 }, [supply, extract], 50)).toBe(extract);
  });

  it('accepts a point exactly on the radius edge', () => {
    expect(anchorAtPoint({ x: 150, y: 100 }, [supply], 50)).toBe(supply);
  });

  it('returns null outside the radius', () => {
    expect(anchorAtPoint({ x: 151, y: 100 }, [supply], 50)).toBeNull();
  });

  it('joins when the segment type equals the anchor type', () => {
    expect(decideAnchorEnd(supply, 'supply', 'Supply air')).toEqual({ kind: 'join', anchor: supply });
  });

  it('blocks with the refusal text when the segment type differs', () => {
    expect(decideAnchorEnd(supply, 'extract', 'Extract air')).toEqual({
      kind: 'blocked',
      anchor: supply,
      text: 'Supply air riser 1 takes only Supply air. This segment is Extract air.',
    });
  });

  it('builds the exact refusal text', () => {
    expect(anchorRefusalText(supply, 'Extract air')).toBe('Supply air riser 1 takes only Supply air. This segment is Extract air.');
  });
});
