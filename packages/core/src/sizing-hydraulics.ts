// Pure hydraulics for duct and pipe sizing: velocity, friction, pressure drop.
// No I/O and no rendering. Units are SI unless a name says otherwise (mm, Pa).

export interface Fluid {
  densityKgM3: number;
  viscosityM2S: number;
  roughnessMm: number;
}

export const AIR_FLUID: Fluid = { densityKgM3: 1.2, viscosityM2S: 1.5e-5, roughnessMm: 0.09 };
export const WATER_FLUID: Fluid = { densityKgM3: 1000, viscosityM2S: 1.0e-6, roughnessMm: 0.045 };

/** J/(kg K) */
export const WATER_SPECIFIC_HEAT = 4186;

/** Reynolds number below which the flow is laminar. */
const LAMINAR_RE = 2300;

/** Smallest and largest diameter of the search grid (m). */
const GRID_MIN_M = 0.005;
const GRID_MAX_M = 5;
const GRID_STEPS = 400;

export const velocityMs = (flowM3s: number, diameterM: number): number =>
  (4 * flowM3s) / (Math.PI * diameterM * diameterM);

export function frictionFactor(reynolds: number, relativeRoughness: number): number {
  if (reynolds < LAMINAR_RE) return 64 / reynolds;
  return 0.25 / Math.log10(relativeRoughness / 3.7 + 5.74 / reynolds ** 0.9) ** 2;
}

export function pressureDropPaPerM(flowM3s: number, diameterM: number, fluid: Fluid): number {
  const v = velocityMs(flowM3s, diameterM);
  const reynolds = (v * diameterM) / fluid.viscosityM2S;
  const relativeRoughness = fluid.roughnessMm / 1000 / diameterM;
  return frictionFactor(reynolds, relativeRoughness) * ((fluid.densityKgM3 * v * v) / 2) / diameterM;
}

/** Huebscher: the round diameter (mm) that matches a rectangle a × b (mm). */
export function equivalentDiameterMm(aMm: number, bMm: number): number {
  return (1.3 * (aMm * bMm) ** 0.625) / (aMm + bMm) ** 0.25;
}

/**
 * The smallest round diameter (m) such that this diameter and every larger one meet both limits.
 * The friction factor jumps at the laminar limit, so the pressure limit is searched on a grid.
 * The result is capped at the largest grid diameter (5 m) when that diameter still violates a limit.
 */
export function minimumDiameterM(flowM3s: number, fluid: Fluid, maxVelocityMs: number, maxPaPerM: number): number {
  if (flowM3s <= 0) return 0;

  const velocityDiameter = Math.sqrt((4 * flowM3s) / (Math.PI * maxVelocityMs));
  const gridDiameter = (i: number): number => GRID_MIN_M * (GRID_MAX_M / GRID_MIN_M) ** (i / (GRID_STEPS - 1));
  const violatesPressure = (d: number): boolean => pressureDropPaPerM(flowM3s, d, fluid) > maxPaPerM;
  const violates = (d: number): boolean => violatesPressure(d) || velocityMs(flowM3s, d) > maxVelocityMs;

  let lastViolating = -1;
  for (let i = 0; i < GRID_STEPS; i++) {
    if (violates(gridDiameter(i))) lastViolating = i;
  }
  if (lastViolating === GRID_STEPS - 1) return GRID_MAX_M;
  if (lastViolating < 0) return Math.max(GRID_MIN_M, velocityDiameter);

  let lo = gridDiameter(lastViolating);
  let hi = gridDiameter(lastViolating + 1);
  for (let step = 0; step < 60; step++) {
    const mid = (lo + hi) / 2;
    if (violatesPressure(mid)) lo = mid;
    else hi = mid;
  }
  return Math.max(hi, velocityDiameter);
}
