// Air duct sizing for one segment: the smallest standard size that meets the velocity and pressure limits.
// No I/O and no rendering. Units are SI unless a name says otherwise (mm, Pa).

import { AIR_FLUID, equivalentDiameterMm, minimumDiameterM, pressureDropPaPerM, velocityMs } from './sizing-hydraulics.js';
import { RECT_SIDE_MAX_MM, RECT_SIDE_MIN_MM, RECT_SIDE_STEP_MM, ROUND_DUCT_SERIES_MM, nextSize, roundUpTo } from './sizing-series.js';
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

interface RectPair {
  w: number;
  h: number;
}

/** The pair with the smallest area on the side grid; on a tie the smaller w/h wins. w is never below h. */
function searchRectangle(
  maxRatio: number,
  pressureDiameterMm: number,
  flowM3s: number,
  maxVelocityMs: number,
  checkVelocity: boolean,
): RectPair | null {
  let best: RectPair | null = null;
  for (let h = RECT_SIDE_MIN_MM; h <= RECT_SIDE_MAX_MM; h += RECT_SIDE_STEP_MM) {
    for (let w = h; w <= RECT_SIDE_MAX_MM; w += RECT_SIDE_STEP_MM) {
      if (w / h > maxRatio + 1e-9) break;
      if (equivalentDiameterMm(w, h) < pressureDiameterMm) continue;
      if (checkVelocity && flowM3s / (w * h * 1e-6) > maxVelocityMs) continue;
      const area = w * h;
      if (!best || area < best.w * best.h || (area === best.w * best.h && w / h < best.w / best.h)) best = { w, h };
    }
  }
  return best;
}

function sizeRectangularAir(flowM3s: number, settings: AirSizing): SizePick | null {
  const aspectLimit = settings.maxAspectRatio ?? 4;
  const pressureDiameterMm = 1000 * minimumDiameterM(flowM3s, AIR_FLUID, Infinity, settings.maxPressureDropPaPerM);
  const best = searchRectangle(aspectLimit, pressureDiameterMm, flowM3s, settings.maxVelocityMs, true);
  if (!best) return null;

  const area = best.w * best.h;
  const unlimited = searchRectangle(Infinity, pressureDiameterMm, flowM3s, settings.maxVelocityMs, true);
  const withoutVelocity = searchRectangle(aspectLimit, pressureDiameterMm, flowM3s, settings.maxVelocityMs, false);
  let governedBy: GovernedBy;
  if (unlimited && unlimited.w * unlimited.h < area) governedBy = 'aspect';
  else if (withoutVelocity && withoutVelocity.w * withoutVelocity.h < area) governedBy = 'velocity';
  else if (best.w === RECT_SIDE_MIN_MM && best.h === RECT_SIDE_MIN_MM) governedBy = 'minimum';
  else governedBy = 'pressure';

  const diameterMm = equivalentDiameterMm(best.w, best.h);
  return {
    shape: 'rectangular',
    widthMm: best.w,
    heightMm: best.h,
    velocityMs: flowM3s > 0 ? flowM3s / (area * 1e-6) : 0,
    pressureDropPaPerM: flowM3s > 0 ? pressureDropPaPerM(flowM3s, diameterMm / 1000, AIR_FLUID) : 0,
    governedBy,
  };
}

/** null when no size of the series meets the limits. */
export function sizeAirSegment(flowM3s: number, settings: AirSizing): SizePick | null {
  if (settings.shape === 'rectangular') return sizeRectangularAir(flowM3s, settings);

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
