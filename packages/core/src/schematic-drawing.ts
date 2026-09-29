// Turns a shape drawn on the sheet into a block (electrical-schematic-templates.md Phase 5b-3).
// The user draws in sheet mm; a drawing block stores shapes as fractions of its own box. Each drawn
// shape becomes one small block, so the existing block tools move, rotate, resize and delete it.
// Pure functions, no rendering.

import { symbolShapeBounds } from './symbol-shape-geometry.js';
import type { SymbolShape } from './symbol-shapes.js';

export interface SheetSize {
  widthMm: number;
  heightMm: number;
}

export interface DrawnBlockPlacement {
  /** Top-left corner and size of the block, in sheet mm. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The shape in fractions of the block box. */
  shape: SymbolShape;
}

const MIN_BOX_MM = 1;

/**
 * `shape` has fractions of the whole sheet as its coordinates (radius: a fraction of the shorter
 * sheet side, font size and rectangle height: fractions of the sheet height). The result is the
 * smallest box that holds it, plus half a stroke on each side, and the same shape re-expressed in
 * fractions of that box. `strokeMm` becomes the line width, in mm, on the block.
 */
export function drawnShapeToBlock(shape: SymbolShape, sheet: SheetSize, strokeMm: number): DrawnBlockPlacement {
  const W = sheet.widthMm;
  const H = sheet.heightMm;
  const bounds = symbolShapeBounds(shape, W, H);
  const centerX = (bounds.x + bounds.width / 2) * W;
  const centerY = (bounds.y + bounds.height / 2) * H;
  const width = Math.max(bounds.width * W + strokeMm, MIN_BOX_MM);
  const height = Math.max(bounds.height * H + strokeMm, MIN_BOX_MM);
  const box = { x: centerX - width / 2, y: centerY - height / 2, width, height };

  const px = (v: number) => (v * W - box.x) / box.width;
  const py = (v: number) => (v * H - box.y) / box.height;
  const sx = (v: number) => (v * W) / box.width;
  const sy = (v: number) => (v * H) / box.height;
  const radius = (v: number) => (v * Math.min(W, H)) / Math.min(box.width, box.height);
  const style = { ...shape.style, strokeWidth: strokeMm / Math.min(box.width, box.height) };

  let placed: SymbolShape;
  switch (shape.kind) {
    case 'line':
    case 'arrow':
      placed = { ...shape, style, x1: px(shape.x1), y1: py(shape.y1), x2: px(shape.x2), y2: py(shape.y2) };
      break;
    case 'rect':
      placed = { ...shape, style, x: px(shape.x), y: py(shape.y), width: sx(shape.width), height: sy(shape.height) };
      break;
    case 'image':
      placed = { ...shape, x: px(shape.x), y: py(shape.y), width: sx(shape.width), height: sy(shape.height) };
      break;
    case 'circle':
    case 'arc':
      placed = { ...shape, style, cx: px(shape.cx), cy: py(shape.cy), radius: radius(shape.radius) };
      break;
    case 'ellipse':
      placed = { ...shape, style, cx: px(shape.cx), cy: py(shape.cy), radiusX: sx(shape.radiusX), radiusY: sy(shape.radiusY) };
      break;
    case 'polygon':
      placed = { ...shape, style, points: shape.points.map((p) => ({ x: px(p.x), y: py(p.y) })) };
      break;
    case 'text':
      placed = { ...shape, style, x: px(shape.x), y: py(shape.y), fontSize: sy(shape.fontSize) };
      break;
  }
  return { ...box, shape: placed };
}
