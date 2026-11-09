import { describe, expect, it } from 'vitest';
import { calibrationFromScale } from './calibration.js';
import { inConflict, mmToPt, pageSizeMm, ptToMm, type PageMmFrame } from './riser-coords.js';

const A3_HEIGHT_PT = 841.89;
const ppmm100 = calibrationFromScale(100).pageUnitsPerRealUnit;
const ppmm50 = calibrationFromScale(50).pageUnitsPerRealUnit;
const a3At100: PageMmFrame = { heightPt: A3_HEIGHT_PT, ppmm: ppmm100 };

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

describe('ptToMm / mmToPt flip', () => {
  it('maps the page bottom-left to the top of the mm frame', () => {
    expect(ptToMm({ x: 0, y: 0 }, a3At100)).toEqual({ xMm: 0, yMm: round2(A3_HEIGHT_PT / ppmm100) });
  });

  it('maps the bottom edge of the display to yMm 0 without negative zero', () => {
    const mm = ptToMm({ x: 0, y: A3_HEIGHT_PT }, a3At100);
    expect(mm.xMm).toBe(0);
    expect(mm.yMm).toBe(0);
  });

  it('gives a smaller yMm for a point lower on screen', () => {
    const higher = ptToMm({ x: 100, y: 200 }, a3At100);
    const lower = ptToMm({ x: 100, y: 400 }, a3At100);
    expect(lower.yMm).toBeLessThan(higher.yMm);
  });
});

describe('rotated page', () => {
  const realBottomLeftMm = { xMm: 0, yMm: 0 };

  it('gives (0,0) mm for the displayed bottom-left corner on rotation 0 and 90', () => {
    const rot0: PageMmFrame = { heightPt: 1190, ppmm: ppmm100 };
    const rot90: PageMmFrame = { heightPt: 842, ppmm: ppmm100 };
    expect(mmToPt(realBottomLeftMm, rot0)).toEqual({ x: 0, y: 1190 });
    expect(mmToPt(realBottomLeftMm, rot90)).toEqual({ x: 0, y: 842 });
    expect(ptToMm({ x: 0, y: 1190 }, rot0)).toEqual({ xMm: 0, yMm: 0 });
    expect(ptToMm({ x: 0, y: 842 }, rot90)).toEqual({ xMm: 0, yMm: 0 });
  });

  it('gives a different yMm when the unswapped height is used on a rotated page', () => {
    const displayedHeight = 842;
    const unswappedHeight = 1190;
    const right = ptToMm({ x: 0, y: displayedHeight }, { heightPt: displayedHeight, ppmm: ppmm100 });
    const wrong = ptToMm({ x: 0, y: displayedHeight }, { heightPt: unswappedHeight, ppmm: ppmm100 });
    expect(right.yMm).toBe(0);
    expect(wrong.yMm).not.toEqual(right.yMm);
  });
});

describe('scale independence', () => {
  it('gives the same mm on 1:100 and 1:50 for one real point', () => {
    const mm = { xMm: 123.45, yMm: 678.9 };
    const frame100: PageMmFrame = { heightPt: A3_HEIGHT_PT, ppmm: ppmm100 };
    const frame50: PageMmFrame = { heightPt: A3_HEIGHT_PT * 2, ppmm: ppmm50 };
    const pt100 = mmToPt(mm, frame100);
    const pt50 = mmToPt(mm, frame50);
    expect(pt100).not.toEqual(pt50);
    expect(ptToMm(pt100, frame100)).toEqual(mm);
    expect(ptToMm(pt50, frame50)).toEqual(mm);
  });

  it('gives the same yMm for the same real height above the bottom edge on pages of different heights', () => {
    const shortPage: PageMmFrame = { heightPt: A3_HEIGHT_PT, ppmm: ppmm100 };
    const tallPage: PageMmFrame = { heightPt: 1190.55, ppmm: ppmm100 };
    const height = { xMm: 0, yMm: 300 };
    expect(ptToMm(mmToPt(height, shortPage), shortPage).yMm).toBe(300);
    expect(ptToMm(mmToPt(height, tallPage), tallPage).yMm).toBe(300);
  });
});

describe('round trip', () => {
  it('returns a point within 0.01 mm after pt to mm to pt', () => {
    const frame: PageMmFrame = { heightPt: A3_HEIGHT_PT, ppmm: ppmm100 };
    const p = { x: 123.4, y: 456.7 };
    const back = mmToPt(ptToMm(p, frame), frame);
    const distanceMm = Math.hypot(back.x - p.x, back.y - p.y) / ppmm100;
    expect(distanceMm).toBeLessThan(0.01);
  });

  it('returns the same mm after mm to pt to mm for values rounded to 0.01 mm', () => {
    const frame: PageMmFrame = { heightPt: A3_HEIGHT_PT, ppmm: ppmm100 };
    expect(ptToMm(mmToPt({ xMm: 123.45, yMm: 678.9 }, frame), frame)).toEqual({ xMm: 123.45, yMm: 678.9 });
  });
});

describe('pageSizeMm', () => {
  it('converts an A3 page at 1:100 to mm', () => {
    const size = pageSizeMm(841.89, 1190.55, ppmm100);
    expect(size.widthMm).toBeCloseTo(841.89 / ppmm100, 9);
    expect(size.heightMm).toBeCloseTo(1190.55 / ppmm100, 9);
    expect(size.widthMm).toBeCloseTo(29700, 0);
    expect(size.heightMm).toBeCloseTo(42000, 0);
  });

  it('gives equal mm for 1:100 and 1:50 pages whose pt sizes are in ratio 1:2', () => {
    const at100 = pageSizeMm(420, 595, ppmm100);
    const at50 = pageSizeMm(840, 1190, ppmm50);
    expect(at50.widthMm).toBeCloseTo(at100.widthMm, 9);
    expect(at50.heightMm).toBeCloseTo(at100.heightMm, 9);
  });
});

describe('inConflict', () => {
  const anchor = { xMm: 100, yMm: 100 };

  it('is false at 0.4 mm from the anchor', () => {
    const fittingPt = mmToPt({ xMm: 100.4, yMm: 100 }, a3At100);
    expect(inConflict(fittingPt, anchor, a3At100)).toBe(false);
  });

  it('is true at 0.6 mm from the anchor', () => {
    const fittingPt = mmToPt({ xMm: 100.6, yMm: 100 }, a3At100);
    expect(inConflict(fittingPt, anchor, a3At100)).toBe(true);
  });
});
