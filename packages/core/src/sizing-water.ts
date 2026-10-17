// Water pipe sizing for one segment: the smallest standard DN that meets the velocity and pressure limits.
// No I/O and no rendering. Units are SI unless a name says otherwise (mm, Pa).

import { WATER_FLUID, WATER_SPECIFIC_HEAT, minimumDiameterM, pressureDropPaPerM, velocityMs } from './sizing-hydraulics.js';
import { PIPE_DN_SERIES_MM, nextSize } from './sizing-series.js';
import type { SizePick } from './sizing-air.js';
import type { WaterSizing } from './sizing-settings.js';

/** m³/s of a power in W for a delta T in K. */
export function waterFlowFromPowerM3s(powerW: number, deltaTK: number): number {
  return powerW / (WATER_SPECIFIC_HEAT * WATER_FLUID.densityKgM3 * deltaTK);
}

/** null when no DN of the series meets the limits. */
export function sizeWaterSegment(flowM3s: number, settings: WaterSizing): SizePick | null {
  const smallestMm = PIPE_DN_SERIES_MM[0];
  const dStarMm = minimumDiameterM(flowM3s, WATER_FLUID, settings.maxVelocityMs, settings.maxPressureDropPaPerM) * 1000;
  const diameterMm = nextSize(PIPE_DN_SERIES_MM, dStarMm);
  if (diameterMm === null) return null;

  let governedBy: SizePick['governedBy'] = 'minimum';
  if (dStarMm >= smallestMm) {
    const velocityDiameterM = Math.sqrt((4 * flowM3s) / (Math.PI * settings.maxVelocityMs));
    const pressureDiameterM = minimumDiameterM(flowM3s, WATER_FLUID, Infinity, settings.maxPressureDropPaPerM);
    governedBy = velocityDiameterM > pressureDiameterM ? 'velocity' : 'pressure';
  }

  const diameterM = diameterMm / 1000;
  return {
    shape: 'round',
    diameterMm,
    velocityMs: flowM3s > 0 ? velocityMs(flowM3s, diameterM) : 0,
    pressureDropPaPerM: flowM3s > 0 ? pressureDropPaPerM(flowM3s, diameterM, WATER_FLUID) : 0,
    governedBy,
  };
}
