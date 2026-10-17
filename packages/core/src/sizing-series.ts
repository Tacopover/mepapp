// Standard size series for the sizing of duct and pipe (R5, plan P-R5-08). The sizes are constants.

/** Standard round duct diameters, in mm. */
export const ROUND_DUCT_SERIES_MM: readonly number[] = [63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250];

/** Standard pipe nominal diameters (DN), in mm. */
export const PIPE_DN_SERIES_MM: readonly number[] = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];

/** The smallest side of a rectangular duct, in mm. */
export const RECT_SIDE_MIN_MM = 100;
/** The largest side of a rectangular duct, in mm. */
export const RECT_SIDE_MAX_MM = 2000;
/** The step between two sides of a rectangular duct, in mm. */
export const RECT_SIDE_STEP_MM = 50;

/** The first size of the series that is at least `minimumMm`, or null when the series ends below it. */
export function nextSize(series: readonly number[], minimumMm: number): number | null {
  const found = series.find((size) => size >= minimumMm - 1e-9);
  return found ?? null;
}

/** The next multiple of `stepMm` at least `minimumMm`. */
export function roundUpTo(minimumMm: number, stepMm: number): number {
  return Math.ceil(minimumMm / stepMm - 1e-9) * stepMm;
}
