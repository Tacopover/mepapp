import { describe, expect, it } from 'vitest';
import { sizeAirSegment } from './sizing-air.js';
import { AIR_FLUID, equivalentDiameterMm, minimumDiameterM, pressureDropPaPerM, velocityMs } from './sizing-hydraulics.js';
import { RECT_DUCT_SIDES_MM, ROUND_DUCT_SERIES_MM, rectFreeSidesMm } from './sizing-series.js';
import { SUGGESTED_AIR_SIZING, type AirSizing } from './sizing-settings.js';

const settings = { ...SUGGESTED_AIR_SIZING };

/** The size of the series just below the pick, in mm. */
const smallerSizeMm = (diameterMm: number): number => ROUND_DUCT_SERIES_MM[ROUND_DUCT_SERIES_MM.indexOf(diameterMm) - 1];

describe('sizeAirSegment (round)', () => {
  it('sizes 0.1 m³/s at the suggested limits', () => {
    // The velocity diameter at 5 m/s is 160 mm, below D* (186 mm), so the pressure limit governs.
    const pick = sizeAirSegment(0.1, settings);
    expect(pick).not.toBeNull();
    expect(pick!.shape).toBe('round');
    expect(pick!.diameterMm).toBe(200);
    expect(pick!.governedBy).toBe('pressure');
    expect(Math.abs(pick!.velocityMs - 3.183) / 3.183).toBeLessThan(0.001);
    expect(Math.abs(pick!.pressureDropPaPerM - 0.7025) / 0.7025).toBeLessThan(0.02);
  });

  it('sizes 0.02 m³/s to 125 mm with D* between 100 and 104 mm', () => {
    const dStarMm = minimumDiameterM(0.02, AIR_FLUID, 5, 1) * 1000;
    expect(dStarMm).toBeGreaterThan(100);
    expect(dStarMm).toBeLessThan(104);
    const pick = sizeAirSegment(0.02, settings);
    expect(pick!.diameterMm).toBe(125);
    expect(pick!.pressureDropPaPerM).toBeLessThanOrEqual(1.0);
  });

  it('keeps the velocity and the pressure drop within the limits at 0.64 m³/s', () => {
    const pick = sizeAirSegment(0.64, settings);
    expect(pick!.velocityMs).toBeLessThanOrEqual(5);
    expect(pick!.pressureDropPaPerM).toBeLessThanOrEqual(1.0);
    const smaller = smallerSizeMm(pick!.diameterMm!);
    const breaks = velocityMs(0.64, smaller / 1000) > 5 || pressureDropPaPerM(0.64, smaller / 1000, AIR_FLUID) > 1.0;
    expect(breaks).toBe(true);
  });

  it('meets both limits and breaks at the next smaller size for 20 flows from 0.005 to 1.5 m³/s', () => {
    for (let i = 0; i < 20; i++) {
      const flow = 0.005 * 300 ** (i / 19);
      const pick = sizeAirSegment(flow, settings);
      expect(pick, `flow ${flow}`).not.toBeNull();
      expect(pick!.velocityMs, `flow ${flow}`).toBeLessThanOrEqual(5);
      expect(pick!.pressureDropPaPerM, `flow ${flow}`).toBeLessThanOrEqual(1.0);
      if (pick!.diameterMm! > ROUND_DUCT_SERIES_MM[0]) {
        const smaller = smallerSizeMm(pick!.diameterMm!);
        const breaks = velocityMs(flow, smaller / 1000) > 5 || pressureDropPaPerM(flow, smaller / 1000, AIR_FLUID) > 1.0;
        expect(breaks, `flow ${flow}`).toBe(true);
      }
    }
  });

  it('rounds the free series to a multiple of 10 mm at least D*', () => {
    const dStarMm = minimumDiameterM(0.1, AIR_FLUID, 5, 1) * 1000;
    const pick = sizeAirSegment(0.1, { ...settings, series: 'free' });
    expect(pick!.diameterMm! % 10).toBe(0);
    expect(pick!.diameterMm! - dStarMm).toBeLessThanOrEqual(10);
    expect(pick!.diameterMm!).toBeGreaterThanOrEqual(dStarMm);
  });

  it('returns null for both series when 1250 mm cannot carry the flow', () => {
    expect(sizeAirSegment(20, settings)).toBeNull();
    expect(sizeAirSegment(20, { ...settings, series: 'free' })).toBeNull();
  });

  it('returns the 63 mm minimum for flow 0', () => {
    // The caller never sends 0. The test documents the behavior.
    const pick = sizeAirSegment(0, settings);
    expect(pick!.diameterMm).toBe(63);
    expect(pick!.governedBy).toBe('minimum');
    expect(pick!.velocityMs).toBe(0);
    expect(pick!.pressureDropPaPerM).toBe(0);
  });

  it('is governed by velocity when the velocity limit is low', () => {
    // The velocity diameter at 2 m/s is 252.3 mm, so the pick is 315 mm.
    const pick = sizeAirSegment(0.1, { ...settings, maxVelocityMs: 2, maxPressureDropPaPerM: 100 });
    expect(pick!.diameterMm).toBe(315);
    expect(pick!.governedBy).toBe('velocity');
  });

  it('returns a pick for a rectangular shape', () => {
    const pick = sizeAirSegment(0.1, { ...settings, shape: 'rectangular' });
    expect(pick).not.toBeNull();
    expect(pick!.shape).toBe('rectangular');
    expect(pick!.widthMm).toBeDefined();
    expect(pick!.heightMm).toBeDefined();
  });
});

const rect: AirSizing = { ...SUGGESTED_AIR_SIZING, shape: 'rectangular' };

/** Every pair (w >= h) of the list of sides within the aspect limit that meets the velocity and pressure limits. */
function validPairs(flowM3s: number, maxRatio: number, maxVelocityMs: number, pressureDiameterMm: number, sides: readonly number[] = RECT_DUCT_SIDES_MM) {
  const pairs: { w: number; h: number }[] = [];
  for (const h of sides) {
    for (const w of sides) {
      if (w < h) continue;
      if (w / h > maxRatio + 1e-9) break;
      if (equivalentDiameterMm(w, h) >= pressureDiameterMm && flowM3s / (w * h * 1e-6) <= maxVelocityMs) pairs.push({ w, h });
    }
  }
  return pairs;
}

describe('sizeAirSegment (rectangular)', () => {
  it('picks the smallest valid pair of the preferred sides (values unverified against EN 1505) at 0.1 m³/s', () => {
    const pressureDiameterMm = 1000 * minimumDiameterM(0.1, AIR_FLUID, Infinity, 1);
    const pick = sizeAirSegment(0.1, rect)!;
    expect(equivalentDiameterMm(pick.widthMm!, pick.heightMm!)).toBeGreaterThanOrEqual(pressureDiameterMm);
    expect(0.1 / (pick.widthMm! * pick.heightMm! * 1e-6)).toBeLessThanOrEqual(5);
    const area = pick.widthMm! * pick.heightMm!;
    const smaller = validPairs(0.1, 4, 5, pressureDiameterMm).filter((p) => p.w * p.h < area);
    expect(smaller).toEqual([]);
    expect(RECT_DUCT_SIDES_MM).toContain(pick.widthMm);
    expect(RECT_DUCT_SIDES_MM).toContain(pick.heightMm);
  });

  it('picks a pair of the 50 mm grid with the free series', () => {
    const pressureDiameterMm = 1000 * minimumDiameterM(0.1, AIR_FLUID, Infinity, 1);
    const pick = sizeAirSegment(0.1, { ...rect, series: 'free' })!;
    const sides = rectFreeSidesMm();
    expect(sides).toContain(pick.widthMm);
    expect(sides).toContain(pick.heightMm);
    const area = pick.widthMm! * pick.heightMm!;
    expect(validPairs(0.1, 4, 5, pressureDiameterMm, sides).filter((p) => p.w * p.h < area)).toEqual([]);
  });

  it('has the preferred sides (unverified against EN 1505) in increasing order from 100 to 2000 mm', () => {
    expect(RECT_DUCT_SIDES_MM[0]).toBe(100);
    expect(RECT_DUCT_SIDES_MM[RECT_DUCT_SIDES_MM.length - 1]).toBe(2000);
    RECT_DUCT_SIDES_MM.slice(1).forEach((side, index) => expect(side).toBeGreaterThan(RECT_DUCT_SIDES_MM[index]));
  });

  it('breaks an area tie with the smaller aspect ratio', () => {
    // A tie needs two valid grid pairs with the same area. The scan finds the first flow where one exists.
    let found = false;
    for (let i = 0; i <= 400 && !found; i++) {
      const flow = 0.005 * 1000 ** (i / 400);
      const pressureDiameterMm = 1000 * minimumDiameterM(flow, AIR_FLUID, Infinity, 1);
      const pairs = validPairs(flow, 4, 5, pressureDiameterMm);
      const minArea = Math.min(...pairs.map((p) => p.w * p.h));
      const tied = pairs.filter((p) => p.w * p.h === minArea);
      if (tied.length < 2) continue;
      found = true;
      const minRatio = Math.min(...tied.map((p) => p.w / p.h));
      const pick = sizeAirSegment(flow, rect)!;
      expect(pick.widthMm! / pick.heightMm!).toBe(minRatio);
    }
    expect(found).toBe(true);
  });

  it('keeps w >= h and w / h within the default limit of 4 for 20 flows from 0.005 to 5 m³/s', () => {
    const noRatio: AirSizing = { method: 'air', maxVelocityMs: 5, maxPressureDropPaPerM: 1, shape: 'rectangular', series: 'standard' };
    for (let i = 0; i < 20; i++) {
      const flow = 0.005 * 1000 ** (i / 19);
      const pick = sizeAirSegment(flow, noRatio);
      expect(pick, `flow ${flow}`).not.toBeNull();
      expect(pick!.widthMm!, `flow ${flow}`).toBeGreaterThanOrEqual(pick!.heightMm!);
      expect(pick!.widthMm! / pick!.heightMm!, `flow ${flow}`).toBeLessThanOrEqual(4);
    }
  });

  it('gives a square pick with maxAspectRatio 1', () => {
    for (let i = 0; i < 20; i++) {
      const flow = 0.005 * 1000 ** (i / 19);
      const pick = sizeAirSegment(flow, { ...rect, maxAspectRatio: 1 });
      expect(pick, `flow ${flow}`).not.toBeNull();
      expect(pick!.widthMm, `flow ${flow}`).toBe(pick!.heightMm);
    }
  });

  it('is governed by the aspect limit when the limit 1.5 enlarges the area', () => {
    // Measured at 0.1 m³/s the limits 1, 1.5 and 4 give 200 x 200 (aspect, 40000 mm²), 200 x 150 (pressure, 30000 mm²)
    // and 200 x 150 (pressure, 30000 mm²). A limit 1.5 is not larger than 4 at 0.1 m³/s, so the scan finds another flow.
    // Measured at 0.0411 m³/s the limit 1.5 gives 150 x 150 (aspect, 22500 mm²) and the unlimited search gives
    // 200 x 100 (pressure, 20000 mm²). The square pair has a larger area only because the limit excludes 200 x 100.
    let found = false;
    for (let i = 0; i <= 400 && !found; i++) {
      const flow = 0.005 * 1000 ** (i / 400);
      const limited = sizeAirSegment(flow, { ...rect, maxAspectRatio: 1.5 });
      const unlimited = sizeAirSegment(flow, { ...rect, maxAspectRatio: Infinity });
      if (!limited || !unlimited) continue;
      if (limited.widthMm! * limited.heightMm! <= unlimited.widthMm! * unlimited.heightMm!) continue;
      found = true;
      expect(limited.governedBy).toBe('aspect');
    }
    expect(found).toBe(true);
  });

  it('returns null when 2000 x 2000 cannot carry 50 m³/s', () => {
    expect(sizeAirSegment(50, rect)).toBeNull();
  });

  it('reports the drop for the equivalent diameter of the pick', () => {
    const pick = sizeAirSegment(0.1, rect)!;
    expect(pick.pressureDropPaPerM).toBe(pressureDropPaPerM(0.1, equivalentDiameterMm(pick.widthMm!, pick.heightMm!) / 1000, AIR_FLUID));
  });

  it('has a larger area than the round duct of the same equivalent diameter', () => {
    for (let i = 0; i < 20; i++) {
      const flow = 0.005 * 1000 ** (i / 19);
      const pick = sizeAirSegment(flow, rect)!;
      const dE = equivalentDiameterMm(pick.widthMm!, pick.heightMm!);
      expect(pick.widthMm! * pick.heightMm!, `flow ${flow}`).toBeGreaterThan((Math.PI / 4) * dE * dE);
    }
  });

  it('is governed by velocity with a low velocity limit', () => {
    const pick = sizeAirSegment(0.1, { ...rect, maxVelocityMs: 1, maxPressureDropPaPerM: 100 })!;
    expect(pick.governedBy).toBe('velocity');
    expect(pick.widthMm! * pick.heightMm!).toBeGreaterThanOrEqual(0.1 / 1 / 1e-6);
  });
});
