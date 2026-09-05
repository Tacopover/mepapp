import { describe, expect, it } from 'vitest';
import {
  calibrateFromKnownDistance,
  contentToDisplay,
  displayDimensions,
  displayToContent,
  measureRealDistance,
  type PageDimensions,
  type PageRotation,
} from './calibration.js';

const page: PageDimensions = { widthPt: 612, heightPt: 792 }; // US Letter
const rotations: PageRotation[] = [0, 90, 180, 270];

describe('coordinate fidelity — content/display round trip under page rotation', () => {
  const samplePoints = [
    { x: 0, y: 0 },
    { x: 612, y: 0 },
    { x: 0, y: 792 },
    { x: 612, y: 792 },
    { x: 217.3, y: 483.9 },
  ];

  for (const rotation of rotations) {
    it(`recovers the exact original point after content->display->content at rotation ${rotation}`, () => {
      for (const p of samplePoints) {
        const roundTripped = displayToContent(contentToDisplay(p, page, rotation), page, rotation);
        expect(roundTripped.x).toBeCloseTo(p.x, 9);
        expect(roundTripped.y).toBeCloseTo(p.y, 9);
      }
    });
  }

  it('maps the page corners onto the display rect corners for each rotation', () => {
    for (const rotation of rotations) {
      const dims = displayDimensions(page, rotation);
      const corners = [
        { x: 0, y: 0 },
        { x: page.widthPt, y: 0 },
        { x: 0, y: page.heightPt },
        { x: page.widthPt, y: page.heightPt },
      ];
      const displayCorners = corners.map((c) => contentToDisplay(c, page, rotation));
      for (const dc of displayCorners) {
        expect(dc.x).toBeGreaterThanOrEqual(-1e-9);
        expect(dc.x).toBeLessThanOrEqual(dims.widthPt + 1e-9);
        expect(dc.y).toBeGreaterThanOrEqual(-1e-9);
        expect(dc.y).toBeLessThanOrEqual(dims.heightPt + 1e-9);
      }
      // all four corners must land on four distinct points (rotation is injective on the rect)
      const unique = new Set(displayCorners.map((c) => `${c.x.toFixed(6)},${c.y.toFixed(6)}`));
      expect(unique.size).toBe(4);
    }
  });

  it('preserves distance between content space and display space (rotation is an isometry)', () => {
    const p1 = { x: 100, y: 50 };
    const p2 = { x: 400, y: 620 };
    const contentDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    for (const rotation of rotations) {
      const d1 = contentToDisplay(p1, page, rotation);
      const d2 = contentToDisplay(p2, page, rotation);
      const displayDistance = Math.hypot(d2.x - d1.x, d2.y - d1.y);
      expect(displayDistance).toBeCloseTo(contentDistance, 9);
    }
  });
});

describe('two-point scale calibration survives page rotation', () => {
  // A synthetic sheet drawn at a 1:50 scale: 1 real-world mm is 50mm on the
  // physical sheet, and the sheet is drawn at 72 pt/inch = 72/25.4 pt/mm.
  const ptPerMm = 72 / 25.4;
  const drawnScale = 50;
  const knownContentPoints = { p1: { x: 100, y: 100 }, p2: { x: 100, y: 100 + 2000 } };
  const knownRealDistanceMm = (2000 / ptPerMm) * drawnScale;

  const measureContentPoints = { p1: { x: 300, y: 100 }, p2: { x: 300, y: 100 + 800 } };
  const expectedMeasuredMm = (800 / ptPerMm) * drawnScale;

  for (const rotation of rotations) {
    it(`calibrates and measures the same real-world distance at rotation ${rotation}`, () => {
      const calibration = calibrateFromKnownDistance(
        contentToDisplay(knownContentPoints.p1, page, rotation),
        contentToDisplay(knownContentPoints.p2, page, rotation),
        knownRealDistanceMm,
      );
      const measured = measureRealDistance(
        contentToDisplay(measureContentPoints.p1, page, rotation),
        contentToDisplay(measureContentPoints.p2, page, rotation),
        calibration,
      );
      expect(measured).toBeCloseTo(expectedMeasuredMm, 9);
    });
  }

  it('rejects a non-positive known distance', () => {
    expect(() => calibrateFromKnownDistance({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toThrow();
  });
});
