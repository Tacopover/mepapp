import type { Vec2 } from './geometry.js';

// Real-world mm coordinates of a displayed page (origin bottom-left, y up). Pure math.

export interface PageMmFrame {
  /** Height of the displayed (rotated) page in pt. */
  heightPt: number;
  /** pt per real mm, the pageUnitsPerRealUnit of the calibration. */
  ppmm: number;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100 + 0;
}

/** Converts a display point (pt, y down) to real mm, rounded to 0.01 mm. */
export function ptToMm(pt: Vec2, page: PageMmFrame): { xMm: number; yMm: number } {
  return {
    xMm: round2(pt.x / page.ppmm),
    yMm: round2((page.heightPt - pt.y) / page.ppmm),
  };
}

/** Converts real mm (y up) to a display point (pt, y down). Not rounded. */
export function mmToPt(mm: { xMm: number; yMm: number }, page: PageMmFrame): Vec2 {
  return {
    x: mm.xMm * page.ppmm,
    y: page.heightPt - mm.yMm * page.ppmm,
  };
}

/** The displayed page size in real mm. Not rounded. */
export function pageSizeMm(widthPt: number, heightPt: number, ppmm: number): { widthMm: number; heightMm: number } {
  return { widthMm: widthPt / ppmm, heightMm: heightPt / ppmm };
}

/** True when a fitting lies more than 0.5 mm from the riser anchor. */
export function inConflict(fittingPt: Vec2, anchorMm: { xMm: number; yMm: number }, page: PageMmFrame): boolean {
  const fitting = {
    xMm: fittingPt.x / page.ppmm,
    yMm: (page.heightPt - fittingPt.y) / page.ppmm,
  };
  return Math.hypot(fitting.xMm - anchorMm.xMm, fitting.yMm - anchorMm.yMm) > 0.5;
}
