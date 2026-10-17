// Air duct sizing for one segment: the smallest standard size that meets the velocity and pressure limits.
// No I/O and no rendering. Units are SI unless a name says otherwise (mm, Pa).

import { AIR_FLUID, minimumDiameterM, pressureDropPaPerM, velocityMs } from './sizing-hydraulics.js';
import { ROUND_DUCT_SERIES_MM, nextSize, roundUpTo } from './sizing-series.js';
import type { AirSizing } from './sizing-settings.js';

export type GovernedBy = 'velocity' | 'pressure' | 'aspect' | 'minimum';

export interface SizePick {
  shape: 'round' | 'rectangular';
  diameterMm?: number;
  widthMm?: number;
  heightMm?: number;
  velocityMs: number;
  pressureDropPaPerM: number;
  governedBy: GovernedBy;
}

/** null when no size of the series meets the limits. */
export function sizeAirSegment(flowM3s: number, settings: AirSizing): SizePick | null {
  if (settings.shape === 'rectangular') return null; // rectangular: next task

  const smallestMm = ROUND_DUCT_SERIES_MM[0];
  const largestMm = ROUND_DUCT_SERIES_MM[ROUND_DUCT_SERIES_MM.length - 1];
  const dStarMm = minimumDiameterM(flowM3s, AIR_FLUID, settings.maxVelocityMs, settings.maxPressureDropPaPerM) * 1000;

  let diameterMm: number | null;
  if (settings.series === 'standard') {
    diameterMm = nextSize(ROUND_DUCT_SERIES_MM, dStarMm);
  } else {
    diameterMm = roundUpTo(Math.max(dStarMm, smallestMm), 10);
    if (diameterMm > largestMm) diameterMm = null;
  }
  if (diameterMm === null) return null;

  let governedBy: GovernedBy = 'minimum';
  if (dStarMm >= smallestMm) {
    const velocityDiameterM = Math.sqrt((4 * flowM3s) / (Math.PI * settings.maxVelocityMs));
    const pressureDiameterM = minimumDiameterM(flowM3s, AIR_FLUID, Infinity, settings.maxPressureDropPaPerM);
    governedBy = velocityDiameterM > pressureDiameterM ? 'velocity' : 'pressure';
  }

  const diameterM = diameterMm / 1000;
  return {
    shape: 'round',
    diameterMm,
    velocityMs: flowM3s > 0 ? velocityMs(flowM3s, diameterM) : 0,
    pressureDropPaPerM: flowM3s > 0 ? pressureDropPaPerM(flowM3s, diameterM, AIR_FLUID) : 0,
    governedBy,
  };
}
