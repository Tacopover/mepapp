// Standard size series for the sizing of duct and pipe (R5, plan P-R5-08). The sizes are constants.

// AIR DUCT SIZE LISTS. These two lists are the only place where the air duct sizes are defined.
// To change a size, edit the number in the list. Keep each list in increasing order. All values are in mm.

/**
 * ROUND DUCT SIZE LIST (the 'standard' series): the diameters of round ducts, in mm (EN 1506 / ISO 7807 series).
 * Edit this list to add, remove or change a round duct diameter. Keep the numbers in increasing order.
 * The 'free' series does not use this list for the pick. It rounds up to steps of 10 mm, within the range of this list.
 */
export const ROUND_DUCT_SERIES_MM: readonly number[] = [63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250];

/**
 * RECTANGULAR DUCT SIZE LIST (the 'standard' series): the preferred sides of rectangular ducts, in mm.
 * Both the width and the height come from this list.
 * UNVERIFIED: these values are the best-known EN 1505 style preferred sides. Nobody has checked them against the
 * text of EN 1505. Check them against the standard, or against the supplier catalog, before you rely on them.
 * Edit this list to add, remove or change a side. Keep the numbers in increasing order.
 * The first value is the smallest side and the last value is the largest side.
 */
export const RECT_DUCT_SIDES_MM: readonly number[] = [100, 125, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1250, 1600, 2000];

/**
 * RECTANGULAR DUCT FREE GRID (the 'free' series): the sides run from the smallest to the largest value, in steps.
 * Edit these three numbers to change the free grid, in mm.
 */
export const RECT_FREE_SIDE_MIN_MM = 100;
export const RECT_FREE_SIDE_MAX_MM = 2000;
export const RECT_FREE_SIDE_STEP_MM = 50;

/** The sides of the 'free' grid of rectangular ducts, built from the three numbers above. */
export function rectFreeSidesMm(): number[] {
  const sides: number[] = [];
  for (let side = RECT_FREE_SIDE_MIN_MM; side <= RECT_FREE_SIDE_MAX_MM; side += RECT_FREE_SIDE_STEP_MM) sides.push(side);
  return sides;
}

/** Standard pipe nominal diameters (DN), in mm. */
export const PIPE_DN_SERIES_MM: readonly number[] = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];

/** The first size of the series that is at least `minimumMm`, or null when the series ends below it. */
export function nextSize(series: readonly number[], minimumMm: number): number | null {
  const found = series.find((size) => size >= minimumMm - 1e-9);
  return found ?? null;
}

/** The next multiple of `stepMm` at least `minimumMm`. */
export function roundUpTo(minimumMm: number, stepMm: number): number {
  return Math.ceil(minimumMm / stepMm - 1e-9) * stepMm;
}
