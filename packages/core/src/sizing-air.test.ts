import { describe, expect, it } from 'vitest';
import { sizeAirSegment } from './sizing-air.js';
import { AIR_FLUID, minimumDiameterM, pressureDropPaPerM, velocityMs } from './sizing-hydraulics.js';
import { ROUND_DUCT_SERIES_MM } from './sizing-series.js';
import { SUGGESTED_AIR_SIZING } from './sizing-settings.js';

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

  it('returns null for a rectangular shape until the next task', () => {
    // Rectangular sizing is built in the next task.
    expect(sizeAirSegment(0.1, { ...settings, shape: 'rectangular' })).toBeNull();
  });
});
