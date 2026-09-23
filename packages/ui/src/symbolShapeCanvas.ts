// Canvas2D draw/rasterize routines for SymbolShape (ports-custom-element-editor-spec.md §5.3).
// The renderer-agnostic geometry (hit-test, bounds, handles, drag/mirror/scale/rotate/translate,
// snapping) moved to @mepapp/core's symbol-shape-geometry.ts (shared-drawing-tool.md Phase 1) and
// is re-exported below so existing imports of this module keep working unchanged. What's left here
// is genuinely Canvas2D/DOM-coupled: drawSymbolShapes (a live CanvasRenderingContext2D), and the
// stamp editor's save-time raster bake (loadShapeImages, rasterizeSymbolShapes) — per
// shared-drawing-tool.md §4, the live editing canvas moves to an SVG adapter (Phase 2), but the
// stamp editor still needs a rasterized iconRef because stamps are placed as PixiJS sprites, so
// this file's remaining job is that one save-time bake step.

import { shapeCenter, type SymbolShape } from '@mepapp/core';

export {
  angleSnap,
  applyHandleDrag,
  arcFromThreePoints,
  collectSnapPoints,
  createDraftShape,
  findNearestSnapPoint,
  gridSnap,
  hitTestSymbolShape,
  isDraftLargeEnough,
  mirrorShape,
  normalizeAngle,
  rescaleShapeForCanvasResize,
  rotateShapeAround,
  scaleShape,
  selectionBounds,
  selectionPivot,
  shapeHandles,
  symbolShapeBounds,
  translateShape,
  updateDraftShape,
  type ShapeDrawTool,
  type ShapeHandle,
  type SnapPoint,
} from '@mepapp/core';

/**
 * `imageCache` resolves an 'image' shape's `dataUrl` to an already-decoded `<img>` — canvas
 * drawImage() needs a loaded element, not a data: URL string, and this draw call is itself
 * synchronous (called every render frame), so it can't await a load mid-draw. A shape whose
 * dataUrl isn't in the cache yet (or omitted entirely) draws as a dashed placeholder rect
 * instead — see loadShapeImages for how the cache gets populated.
 */
export function drawSymbolShapes(ctx: CanvasRenderingContext2D, shapes: SymbolShape[], widthPx: number, heightPx: number, imageCache?: Map<string, HTMLImageElement>): void {
  for (const shape of shapes) {
    ctx.save();
    const rotation = shape.rotation ?? 0;
    if (rotation !== 0) {
      const center = shapeCenter(shape);
      ctx.translate(center.x * widthPx, center.y * heightPx);
      ctx.rotate(rotation);
      ctx.translate(-center.x * widthPx, -center.y * heightPx);
    }
    ctx.lineWidth = Math.max(1, shape.style.strokeWidth * Math.min(widthPx, heightPx));
    ctx.strokeStyle = shape.style.stroke;
    ctx.fillStyle = shape.style.fill ?? 'transparent';
    switch (shape.kind) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(shape.x1 * widthPx, shape.y1 * heightPx);
        ctx.lineTo(shape.x2 * widthPx, shape.y2 * heightPx);
        ctx.stroke();
        break;
      case 'rect':
        ctx.beginPath();
        ctx.rect(shape.x * widthPx, shape.y * heightPx, shape.width * widthPx, shape.height * heightPx);
        if (shape.style.fill) ctx.fill();
        ctx.stroke();
        break;
      case 'circle': {
        // A single radius fraction can't be scaled independently per axis without
        // becoming an ellipse on a non-square canvas — scale by the shorter
        // dimension (same convention strokeWidth and hitTestSymbolShape already use)
        // so it stays a true circle regardless of the artwork's aspect ratio.
        const r = shape.radius * Math.min(widthPx, heightPx);
        ctx.beginPath();
        ctx.ellipse(shape.cx * widthPx, shape.cy * heightPx, r, r, 0, 0, Math.PI * 2);
        if (shape.style.fill) ctx.fill();
        ctx.stroke();
        break;
      }
      case 'arc': {
        const r = shape.radius * Math.min(widthPx, heightPx);
        ctx.beginPath();
        ctx.ellipse(shape.cx * widthPx, shape.cy * heightPx, r, r, 0, shape.startAngle, shape.endAngle);
        ctx.stroke();
        break;
      }
      case 'text':
        ctx.font = `${shape.fontSize * heightPx}px sans-serif`;
        ctx.fillStyle = shape.style.stroke;
        ctx.textBaseline = 'top';
        ctx.fillText(shape.text, shape.x * widthPx, shape.y * heightPx);
        break;
      case 'arrow': {
        const x1 = shape.x1 * widthPx;
        const y1 = shape.y1 * heightPx;
        const x2 = shape.x2 * widthPx;
        const y2 = shape.y2 * heightPx;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLength = Math.max(6, ctx.lineWidth * 3);
        const headAngle = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLength * Math.cos(angle - headAngle), y2 - headLength * Math.sin(angle - headAngle));
        ctx.lineTo(x2 - headLength * Math.cos(angle + headAngle), y2 - headLength * Math.sin(angle + headAngle));
        ctx.closePath();
        ctx.fillStyle = shape.style.stroke;
        ctx.fill();
        break;
      }
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(shape.cx * widthPx, shape.cy * heightPx, shape.radiusX * widthPx, shape.radiusY * heightPx, 0, 0, Math.PI * 2);
        if (shape.style.fill) ctx.fill();
        ctx.stroke();
        break;
      case 'polygon':
        if (shape.points.length === 0) break;
        ctx.beginPath();
        ctx.moveTo(shape.points[0].x * widthPx, shape.points[0].y * heightPx);
        for (const p of shape.points.slice(1)) ctx.lineTo(p.x * widthPx, p.y * heightPx);
        ctx.closePath();
        if (shape.style.fill) ctx.fill();
        ctx.stroke();
        break;
      case 'image': {
        const ix = shape.x * widthPx;
        const iy = shape.y * heightPx;
        const iw = shape.width * widthPx;
        const ih = shape.height * heightPx;
        const img = imageCache?.get(shape.dataUrl);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, ix, iy, iw, ih);
        } else {
          ctx.save();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = '#9aa5ab';
          ctx.strokeRect(ix, iy, iw, ih);
          ctx.restore();
        }
        break;
      }
    }
    ctx.restore();
  }
}

/**
 * Loads every distinct 'image' shape's `dataUrl` not already in `cache` into it, as decoded
 * `<img>` elements ready for drawSymbolShapes's ctx.drawImage(). A failed load is swallowed
 * (the shape just keeps drawing as the placeholder rect) rather than rejecting the whole batch.
 */
export async function loadShapeImages(shapes: SymbolShape[], cache: Map<string, HTMLImageElement>): Promise<void> {
  const urls = new Set<string>();
  for (const shape of shapes) {
    if (shape.kind === 'image' && !cache.has(shape.dataUrl)) urls.add(shape.dataUrl);
  }
  if (urls.size === 0) return;
  await Promise.all(
    [...urls].map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            cache.set(url, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }),
    ),
  );
}

/** Rasterizes to a flat PNG `data:` URL — awaits every 'image' shape's own art decoding first (see loadShapeImages) since the actual draw pass is synchronous. Called once at save time, so a fresh local cache (rather than a shared one) is fine. */
export async function rasterizeSymbolShapes(shapes: SymbolShape[], widthPx: number, heightPx: number): Promise<string> {
  const cache = new Map<string, HTMLImageElement>();
  await loadShapeImages(shapes, cache);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthPx));
  canvas.height = Math.max(1, Math.round(heightPx));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for shape rasterization');
  drawSymbolShapes(ctx, shapes, canvas.width, canvas.height, cache);
  return canvas.toDataURL('image/png');
}
