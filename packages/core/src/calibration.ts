// Coordinate mapping between a PDF page's own content-stream space and the
// upright "display" space the user actually sees and clicks on, plus
// two-point scale calibration on top of it. Pure math, no rendering, no I/O.

import { applyMatrix, invertMatrix, type Mat2x3, type Vec2 } from './geometry.js';

export type PageRotation = 0 | 90 | 180 | 270;

export interface PageDimensions {
  widthPt: number;
  heightPt: number;
}

/**
 * Content-stream space is the PDF spec's own coordinate system: Y-up, origin
 * at the bottom-left of the unrotated MediaBox, units in points. Display
 * space is what the user sees after the page's own /Rotate entry is applied:
 * Y-down, origin at the top-left of the upright displayed page. Both spaces
 * share the same unit (PDF points) — zoom/DPI is a separate, later scale
 * factor, not part of this transform.
 */
export function contentToDisplayTransform(page: PageDimensions, rotation: PageRotation): Mat2x3 {
  switch (rotation) {
    case 0:
      return { a: 1, b: 0, c: 0, d: -1, tx: 0, ty: page.heightPt };
    case 90:
      return { a: 0, b: 1, c: 1, d: 0, tx: 0, ty: 0 };
    case 180:
      return { a: -1, b: 0, c: 0, d: 1, tx: page.widthPt, ty: 0 };
    case 270:
      return { a: 0, b: -1, c: -1, d: 0, tx: page.heightPt, ty: page.widthPt };
  }
}

/** The displayed page's own width/height, swapped from the MediaBox for a 90/270 rotation. */
export function displayDimensions(page: PageDimensions, rotation: PageRotation): PageDimensions {
  return rotation === 90 || rotation === 270
    ? { widthPt: page.heightPt, heightPt: page.widthPt }
    : { widthPt: page.widthPt, heightPt: page.heightPt };
}

export function contentToDisplay(point: Vec2, page: PageDimensions, rotation: PageRotation): Vec2 {
  return applyMatrix(contentToDisplayTransform(page, rotation), point);
}

export function displayToContent(point: Vec2, page: PageDimensions, rotation: PageRotation): Vec2 {
  return applyMatrix(invertMatrix(contentToDisplayTransform(page, rotation)), point);
}

/**
 * Two-point scale calibration: given two points in the same space (typically
 * display space, where the user clicked) and the known real-world distance
 * between them, derives a factor to convert any measured distance in that
 * space into real-world units (e.g. millimeters).
 */
export interface Calibration {
  pageUnitsPerRealUnit: number;
}

export function calibrateFromKnownDistance(p1: Vec2, p2: Vec2, knownRealDistance: number): Calibration {
  if (knownRealDistance <= 0) {
    throw new Error('knownRealDistance must be positive');
  }
  const pageDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return { pageUnitsPerRealUnit: pageDistance / knownRealDistance };
}

export function measureRealDistance(p1: Vec2, p2: Vec2, calibration: Calibration): number {
  const pageDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  return pageDistance / calibration.pageUnitsPerRealUnit;
}
