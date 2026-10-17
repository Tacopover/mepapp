import { describe, expect, it } from 'vitest';
import { sizeWaterSegment, waterFlowFromPowerM3s } from './sizing-water.js';
import { WATER_FLUID, minimumDiameterM, pressureDropPaPerM, velocityMs } from './sizing-hydraulics.js';
import { PIPE_DN_SERIES_MM } from './sizing-series.js';
import { SUGGESTED_WATER_SIZING, type WaterSizing } from './sizing-settings.js';

const settings = { ...SUGGESTED_WATER_SIZING };

const flow10kW = waterFlowFromPowerM3s(10000, 10);

/** The size of the series just below the pick, in mm. */
const smallerSizeMm = (diameterMm: number): number => PIPE_DN_SERIES_MM[PIPE_DN_SERIES_MM.indexOf(diameterMm) - 1];

const meetsLimits = (flowM3s: number, dnMm: number, limits: WaterSizing): boolean =>
  velocityMs(flowM3s, dnMm / 1000) <= limits.maxVelocityMs && pressureDropPaPerM(flowM3s, dnMm / 1000, WATER_FLUID) <= limits.maxPressureDropPaPerM;

describe('waterFlowFromPowerM3s', () => {
  it('gives the flow of 10 kW at 10 K', () => {
    expect(waterFlowFromPowerM3s(10000, 10)).toBeCloseTo(2.389e-4, 7);
  });
});

describe('sizeWaterSegment', () => {
  it('picks DN 25 for 10 kW at 10 K, governed by pressure', () => {
    const pick = sizeWaterSegment(flow10kW, settings);
    expect(pick).not.toBeNull();
    expect(pick?.shape).toBe('round');
    expect(pick?.diameterMm).toBe(25);
    expect(pick?.governedBy).toBe('pressure');
    expect(Math.abs((pick?.velocityMs ?? 0) - 0.49) / 0.49).toBeLessThan(0.03);
    expect(Math.abs((pick?.pressureDropPaPerM ?? 0) - 154) / 154).toBeLessThan(0.03);
  });

  it('gives the hand values for DN 15, 20 and 25 at 10 kW', () => {
    const cases: [number, number, number][] = [
      [15, 1938, 1.35],
      [20, 462, 0.76],
      [25, 154, 0.49],
    ];
    for (const [dnMm, drop, v] of cases) {
      const d = dnMm / 1000;
      expect(Math.abs(pressureDropPaPerM(flow10kW, d, WATER_FLUID) - drop) / drop).toBeLessThan(0.03);
      expect(Math.abs(velocityMs(flow10kW, d) - v) / v).toBeLessThan(0.03);
    }
  });

  it('gives a continuous D* between 20 mm and 25 mm for 10 kW', () => {
    const dStarMm = minimumDiameterM(flow10kW, WATER_FLUID, 1, 200) * 1000;
    expect(dStarMm).toBeGreaterThan(20);
    expect(dStarMm).toBeLessThan(25);
  });

  it('meets both limits at low flow near Re 2300, and so does every larger DN', () => {
    const flow = 1e-5;
    const pick = sizeWaterSegment(flow, settings);
    expect(pick).not.toBeNull();
    const index = PIPE_DN_SERIES_MM.indexOf(pick?.diameterMm ?? -1);
    expect(index).toBeGreaterThanOrEqual(0);
    for (let i = index; i < PIPE_DN_SERIES_MM.length; i++) {
      expect(meetsLimits(flow, PIPE_DN_SERIES_MM[i], settings)).toBe(true);
    }
  });

  it('meets both limits at each of 20 flows, and the next smaller DN breaks a limit or the pick is DN 15', () => {
    const low = 1e-5;
    const high = 0.05;
    for (let i = 0; i < 20; i++) {
      const flow = low * (high / low) ** (i / 19);
      const pick = sizeWaterSegment(flow, settings);
      expect(pick, `flow ${flow}`).not.toBeNull();
      const dn = pick?.diameterMm ?? 0;
      expect(meetsLimits(flow, dn, settings), `flow ${flow} DN ${dn}`).toBe(true);
      if (dn !== PIPE_DN_SERIES_MM[0]) {
        expect(meetsLimits(flow, smallerSizeMm(dn), settings), `flow ${flow} smaller DN ${smallerSizeMm(dn)}`).toBe(false);
      }
    }
  });

  it('gives null for a flow above what DN 300 carries', () => {
    expect(sizeWaterSegment(1, settings)).toBeNull();
  });

  it('gives a smaller or equal DN for a higher velocity limit', () => {
    const limits = [0.5, 1, 2].map((maxVelocityMs) => sizeWaterSegment(flow10kW, { ...settings, maxVelocityMs })?.diameterMm ?? 0);
    expect(limits[1]).toBeLessThanOrEqual(limits[0]);
    expect(limits[2]).toBeLessThanOrEqual(limits[1]);
  });

  it('gives a DN not larger for a delta T twice as large', () => {
    const cold = sizeWaterSegment(waterFlowFromPowerM3s(10000, 10), settings)?.diameterMm ?? 0;
    const warm = sizeWaterSegment(waterFlowFromPowerM3s(10000, 20), settings)?.diameterMm ?? 0;
    expect(warm).toBeLessThanOrEqual(cold);
  });

  it('picks DN 32 for a 4 x 5 kW tree main at 10 K', () => {
    const flow = waterFlowFromPowerM3s(20000, 10);
    expect(flow).toBeCloseTo(4.78e-4, 6);
    expect(pressureDropPaPerM(flow, 0.025, WATER_FLUID)).toBeGreaterThan(200);
    expect(sizeWaterSegment(flow, settings)?.diameterMm).toBe(32);
  });

  it('gives DN 15 with governedBy minimum for flow 0', () => {
    const pick = sizeWaterSegment(0, settings);
    expect(pick?.diameterMm).toBe(15);
    expect(pick?.governedBy).toBe('minimum');
    expect(pick?.velocityMs).toBe(0);
    expect(pick?.pressureDropPaPerM).toBe(0);
  });
});
