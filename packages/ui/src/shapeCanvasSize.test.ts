import { describe, expect, it } from 'vitest';
import { fitCanvasSize } from './shapeCanvasSize.js';

describe('fitCanvasSize', () => {
  it('fixes the longer side and keeps the aspect ratio', () => {
    expect(fitCanvasSize(48, 19.08, 520)).toEqual({ widthPx: 520, heightPx: 207 });
    expect(fitCanvasSize(20, 40, 600)).toEqual({ widthPx: 300, heightPx: 600 });
    expect(fitCanvasSize(30, 30, 600)).toEqual({ widthPx: 600, heightPx: 600 });
  });

  it('never returns less than one pixel and survives a zero or negative size', () => {
    expect(fitCanvasSize(0, 0, 600)).toEqual({ widthPx: 600, heightPx: 600 });
    expect(fitCanvasSize(1000, 0.001, 100)).toEqual({ widthPx: 100, heightPx: 1 });
    expect(fitCanvasSize(-5, 10, 100)).toEqual({ widthPx: 10, heightPx: 100 });
  });
});
