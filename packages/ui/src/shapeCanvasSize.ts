/** Longer side fixed at `maxPx`, shorter side scaled to the artwork's own aspect ratio ("contain within a box"), so a wide or tall drawing area is not squished into a square. */
export function fitCanvasSize(width: number, height: number, maxPx: number): { widthPx: number; heightPx: number } {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  const scale = maxPx / Math.max(w, h);
  return { widthPx: Math.max(1, Math.round(w * scale)), heightPx: Math.max(1, Math.round(h * scale)) };
}
