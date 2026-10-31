import { describe, expect, it } from 'vitest';
import { withPage, type PlacedStamp } from '@mepapp/core';

describe('placed stamp page', () => {
  it('records the shown page on a stamp-shaped object', () => {
    const stamp: PlacedStamp = {
      id: 'stamp-1',
      category: 'terminal',
      transform: { position: { x: 0, y: 0 }, rotationDegrees: 0, scale: { x: 1, y: 1 } },
      nativeWidth: 10,
      nativeHeight: 10,
      ports: [],
    };
    const placed = withPage(stamp, 1);
    expect(placed.pageIndex).toBe(1);
    expect(stamp.pageIndex).toBeUndefined();
  });
});
