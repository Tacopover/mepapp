import { describe, expect, it } from 'vitest';
import {
  AIR_FLUID,
  WATER_FLUID,
  equivalentDiameterMm,
  frictionFactor,
  minimumDiameterM,
  pressureDropPaPerM,
  velocityMs,
} from './sizing-hydraulics.js';

describe('velocityMs', () => {
  it('divides the flow by the round duct area', () => {
    expect(velocityMs(0.1, 0.2)).toBeCloseTo(3.183, 3);
  });
});

describe('frictionFactor', () => {
  it('uses the laminar law below Re 2300', () => {
    expect(frictionFactor(1000, 0.001)).toBeCloseTo(0.064, 6);
  });

  it('jumps at Re 2300 for a smooth pipe (the jump is kept, not removed)', () => {
    const laminar = frictionFactor(2299, 0);
    const turbulent = frictionFactor(2301, 0);
    expect(laminar).toBeCloseTo(0.0278, 3);
    // The plan says about 0.0496. By hand: 2301^0.9 = 1060.97, 0.25 / log10(5.74 / 1060.97)^2 = 0.04866. The code is right.
    expect(turbulent).toBeCloseTo(0.0487, 3);
    expect(turbulent / laminar).toBeGreaterThan(1.5);
  });
});

describe('pressureDropPaPerM', () => {
  it('matches the hand value for 200 mm air at 0.1 m3/s', () => {
    expect(pressureDropPaPerM(0.1, 0.2, AIR_FLUID)).toBeCloseTo(0.7, 2);
  });

  it('falls when the diameter grows (turbulent range)', () => {
    let previous = Infinity;
    for (let k = 0; k < 20; k++) {
      const d = 0.1 + (k * 0.9) / 19;
      const drop = pressureDropPaPerM(0.1, d, AIR_FLUID);
      expect(drop).toBeLessThan(previous);
      previous = drop;
    }
  });

  it('rises when the flow grows (turbulent range)', () => {
    let previous = 0;
    for (let k = 0; k < 20; k++) {
      const q = 0.05 + (k * 0.45) / 19;
      const drop = pressureDropPaPerM(q, 0.2, AIR_FLUID);
      expect(drop).toBeGreaterThan(previous);
      previous = drop;
    }
  });
});

describe('equivalentDiameterMm', () => {
  it('gives the round duct that matches a 400 x 200 mm rectangle', () => {
    expect(equivalentDiameterMm(400, 200)).toBeCloseTo(305, 0);
  });

  it('gives the square-duct formula for a x a and stays below the equal-area round duct', () => {
    const a = 300;
    const square = equivalentDiameterMm(a, a);
    expect(square).toBeCloseTo((1.3 * a ** 1.25) / (2 * a) ** 0.25, 9);
    expect(square).toBeLessThan(Math.sqrt((4 * a * a) / Math.PI));
  });
});

describe('minimumDiameterM', () => {
  it('is governed by the pressure limit when the velocity limit is loose', () => {
    const d = minimumDiameterM(0.1, AIR_FLUID, 8, 1.0);
    expect(pressureDropPaPerM(0.1, d, AIR_FLUID)).toBeCloseTo(1.0, 2);
    expect(Math.abs(d - 0.186)).toBeLessThan(0.003);
  });

  it('is governed by the velocity limit when the pressure limit is loose', () => {
    expect(minimumDiameterM(0.1, AIR_FLUID, 2, 100)).toBeCloseTo(Math.sqrt((4 * 0.1) / (Math.PI * 2)), 6);
  });

  it('gives about 0.102 m for a 0.02 m3/s air flow', () => {
    expect(Math.abs(minimumDiameterM(0.02, AIR_FLUID, 8, 1.0) - 0.102)).toBeLessThan(0.003);
  });

  it('meets both limits at every larger diameter in the low-flow water case', () => {
    const flow = 1e-5;
    const maxVelocity = 1.0;
    const maxPa = 200;
    const d = minimumDiameterM(flow, WATER_FLUID, maxVelocity, maxPa);
    for (let k = 1; k <= 50; k++) {
      const larger = Math.min(d * 1.02 ** k, 5);
      expect(velocityMs(flow, larger)).toBeLessThanOrEqual(maxVelocity);
      expect(pressureDropPaPerM(flow, larger, WATER_FLUID)).toBeLessThanOrEqual(maxPa);
    }
  });

  it('returns 0 for zero or negative flow', () => {
    expect(minimumDiameterM(0, AIR_FLUID, 8, 1.0)).toBe(0);
    expect(minimumDiameterM(-0.1, AIR_FLUID, 8, 1.0)).toBe(0);
  });
});
