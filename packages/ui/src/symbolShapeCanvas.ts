// Draw/rasterize routines for the Element Editor dialog's Shapes mode
// (ports-custom-element-editor-spec.md §5.3). One shared draw routine backs
// both the live editing canvas (ElementEditorDialog) and the final rasterize-
// to-iconRef step on save — SymbolShape's fractional coordinates make it
// resolution-independent, so the same function just gets called at a
// different canvas pixel size for each.

import type { SymbolShape, SymbolShapeStyle } from '@mepapp/core';

/** A shape's own rotation pivot — the center of its unrotated local bounds. Rotating a shape's defining geometry around this point (rather than transforming the raw coordinates) is what `rotation` means throughout this file. */
function shapeCenter(shape: SymbolShape): { x: number; y: number } {
  switch (shape.kind) {
    case 'line':
    case 'arrow':
      return { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
    case 'rect':
      return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
    case 'circle':
    case 'arc':
    case 'ellipse':
      return { x: shape.cx, y: shape.cy };
    case 'text': {
      const width = shape.text.length * shape.fontSize * 0.6;
      return { x: shape.x + width / 2, y: shape.y + shape.fontSize / 2 };
    }
    case 'polygon': {
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    }
  }
}

function rotatePoint(x: number, y: number, cx: number, cy: number, rotation: number): { x: number; y: number } {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

function aabbOfPoints(points: { x: number; y: number }[]): { x: number; y: number; width: number; height: number } {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

export function drawSymbolShapes(ctx: CanvasRenderingContext2D, shapes: SymbolShape[], widthPx: number, heightPx: number): void {
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
      case 'circle':
        ctx.beginPath();
        ctx.ellipse(shape.cx * widthPx, shape.cy * heightPx, shape.radius * widthPx, shape.radius * heightPx, 0, 0, Math.PI * 2);
        if (shape.style.fill) ctx.fill();
        ctx.stroke();
        break;
      case 'arc':
        ctx.beginPath();
        ctx.ellipse(shape.cx * widthPx, shape.cy * heightPx, shape.radius * widthPx, shape.radius * heightPx, 0, shape.startAngle, shape.endAngle);
        ctx.stroke();
        break;
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
    }
    ctx.restore();
  }
}

export function rasterizeSymbolShapes(shapes: SymbolShape[], widthPx: number, heightPx: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthPx));
  canvas.height = Math.max(1, Math.round(heightPx));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable for shape rasterization');
  drawSymbolShapes(ctx, shapes, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** Hit-tests topmost-first (later shapes drawn on top), same convention as z-order in `shapes`. */
export function hitTestSymbolShape(shapes: SymbolShape[], fractionX: number, fractionY: number, widthPx: number, heightPx: number): SymbolShape | null {
  const tolerancePx = 6;
  for (let i = shapes.length - 1; i >= 0; i--) {
    const shape = shapes[i];
    let x = fractionX * widthPx;
    let y = fractionY * heightPx;
    const rotation = shape.rotation ?? 0;
    if (rotation !== 0) {
      // Rotate the test point into the shape's local (unrotated) space instead of rotating the shape's geometry.
      const center = shapeCenter(shape);
      const local = rotatePoint(x, y, center.x * widthPx, center.y * heightPx, -rotation);
      x = local.x;
      y = local.y;
    }
    if (shape.kind === 'line') {
      if (distanceToSegment(x, y, shape.x1 * widthPx, shape.y1 * heightPx, shape.x2 * widthPx, shape.y2 * heightPx) <= tolerancePx) return shape;
    } else if (shape.kind === 'rect') {
      const rx = shape.x * widthPx;
      const ry = shape.y * heightPx;
      const rw = shape.width * widthPx;
      const rh = shape.height * heightPx;
      const inside = x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
      const onEdge = inside && (x - rx <= tolerancePx || rx + rw - x <= tolerancePx || y - ry <= tolerancePx || ry + rh - y <= tolerancePx);
      if (shape.style.fill ? inside : onEdge) return shape;
    } else if (shape.kind === 'circle' || shape.kind === 'arc') {
      const cx = shape.cx * widthPx;
      const cy = shape.cy * heightPx;
      const r = shape.radius * Math.min(widthPx, heightPx);
      const dist = Math.hypot(x - cx, y - cy);
      const filled = shape.kind === 'circle' && shape.style.fill;
      if (filled ? dist <= r : Math.abs(dist - r) <= tolerancePx) return shape;
    } else if (shape.kind === 'text') {
      const tx = shape.x * widthPx;
      const ty = shape.y * heightPx;
      const approxWidth = shape.text.length * shape.fontSize * heightPx * 0.6;
      const approxHeight = shape.fontSize * heightPx;
      if (x >= tx && x <= tx + approxWidth && y >= ty && y <= ty + approxHeight) return shape;
    } else if (shape.kind === 'arrow') {
      if (distanceToSegment(x, y, shape.x1 * widthPx, shape.y1 * heightPx, shape.x2 * widthPx, shape.y2 * heightPx) <= tolerancePx) return shape;
    } else if (shape.kind === 'ellipse') {
      const cx = shape.cx * widthPx;
      const cy = shape.cy * heightPx;
      const rx = Math.max(shape.radiusX * widthPx, 1);
      const ry = Math.max(shape.radiusY * heightPx, 1);
      const normDist = Math.hypot((x - cx) / rx, (y - cy) / ry);
      const edgeTolerance = tolerancePx / Math.min(rx, ry);
      if (shape.style.fill ? normDist <= 1 : Math.abs(normDist - 1) <= edgeTolerance) return shape;
    } else if (shape.kind === 'polygon') {
      const pts = shape.points.map((p) => ({ x: p.x * widthPx, y: p.y * heightPx }));
      if (shape.style.fill) {
        if (pointInPolygon(x, y, pts)) return shape;
      } else {
        let minDist = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i];
          const b = pts[(i + 1) % pts.length];
          minDist = Math.min(minDist, distanceToSegment(x, y, a.x, a.y, b.x, b.y));
        }
        if (minDist <= tolerancePx) return shape;
      }
    }
  }
  return null;
}

function pointInPolygon(x: number, y: number, points: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Returns the *rotated* bounding box (an axis-aligned box tight around the shape as actually drawn) — used for the selection highlight and marquee test. */
export function symbolShapeBounds(shape: SymbolShape): { x: number; y: number; width: number; height: number } {
  const rotation = shape.rotation ?? 0;
  switch (shape.kind) {
    case 'line':
    case 'arrow': {
      if (rotation === 0) {
        return {
          x: Math.min(shape.x1, shape.x2),
          y: Math.min(shape.y1, shape.y2),
          width: Math.abs(shape.x2 - shape.x1),
          height: Math.abs(shape.y2 - shape.y1),
        };
      }
      const center = shapeCenter(shape);
      return aabbOfPoints([rotatePoint(shape.x1, shape.y1, center.x, center.y, rotation), rotatePoint(shape.x2, shape.y2, center.x, center.y, rotation)]);
    }
    case 'rect': {
      if (rotation === 0) return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
      const center = shapeCenter(shape);
      const corners = [
        { x: shape.x, y: shape.y },
        { x: shape.x + shape.width, y: shape.y },
        { x: shape.x + shape.width, y: shape.y + shape.height },
        { x: shape.x, y: shape.y + shape.height },
      ].map((p) => rotatePoint(p.x, p.y, center.x, center.y, rotation));
      return aabbOfPoints(corners);
    }
    case 'circle':
    case 'arc':
      // Rotation about its own center never changes a circle's (or this circle-based arc) bounding box.
      return { x: shape.cx - shape.radius, y: shape.cy - shape.radius, width: shape.radius * 2, height: shape.radius * 2 };
    case 'text': {
      const width = shape.text.length * shape.fontSize * 0.6;
      const height = shape.fontSize;
      if (rotation === 0) return { x: shape.x, y: shape.y, width, height };
      const center = shapeCenter(shape);
      const corners = [
        { x: shape.x, y: shape.y },
        { x: shape.x + width, y: shape.y },
        { x: shape.x + width, y: shape.y + height },
        { x: shape.x, y: shape.y + height },
      ].map((p) => rotatePoint(p.x, p.y, center.x, center.y, rotation));
      return aabbOfPoints(corners);
    }
    case 'ellipse': {
      if (rotation === 0) return { x: shape.cx - shape.radiusX, y: shape.cy - shape.radiusY, width: shape.radiusX * 2, height: shape.radiusY * 2 };
      // Closed-form half-extents of an ellipse rotated in place — rotating its corner points
      // (as the other kinds do) would only bound the ellipse's own axis-aligned bbox, not the ellipse itself.
      const halfWidth = Math.hypot(shape.radiusX * Math.cos(rotation), shape.radiusY * Math.sin(rotation));
      const halfHeight = Math.hypot(shape.radiusX * Math.sin(rotation), shape.radiusY * Math.cos(rotation));
      return { x: shape.cx - halfWidth, y: shape.cy - halfHeight, width: halfWidth * 2, height: halfHeight * 2 };
    }
    case 'polygon': {
      if (rotation === 0) {
        const xs = shape.points.map((p) => p.x);
        const ys = shape.points.map((p) => p.y);
        const minX = Math.min(...xs);
        const minY = Math.min(...ys);
        return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
      }
      const center = shapeCenter(shape);
      return aabbOfPoints(shape.points.map((p) => rotatePoint(p.x, p.y, center.x, center.y, rotation)));
    }
  }
}

export type ShapeDrawTool = 'line' | 'rect' | 'circle' | 'arc' | 'ellipse' | 'arrow';

/** Creates a zero-size shape at the drag's start point; updateDraftShape grows it as the pointer moves. */
export function createDraftShape(tool: ShapeDrawTool, id: string, start: { fractionX: number; fractionY: number }, style: SymbolShapeStyle): SymbolShape {
  const { fractionX: x, fractionY: y } = start;
  switch (tool) {
    case 'line':
      return { id, kind: 'line', x1: x, y1: y, x2: x, y2: y, style, rotation: 0 };
    case 'rect':
      return { id, kind: 'rect', x, y, width: 0, height: 0, style, rotation: 0 };
    case 'circle':
      return { id, kind: 'circle', cx: x, cy: y, radius: 0, style, rotation: 0 };
    case 'arc':
      // Default 270° sweep — fine-tuned afterward via the selected shape's angle inputs, same as the old app's arc tool needed a second adjustment step.
      return { id, kind: 'arc', cx: x, cy: y, radius: 0, startAngle: 0, endAngle: (Math.PI * 3) / 2, style, rotation: 0 };
    case 'arrow':
      return { id, kind: 'arrow', x1: x, y1: y, x2: x, y2: y, style, rotation: 0 };
    case 'ellipse':
      return { id, kind: 'ellipse', cx: x, cy: y, radiusX: 0, radiusY: 0, style, rotation: 0 };
  }
}

export function updateDraftShape(
  draft: SymbolShape,
  start: { fractionX: number; fractionY: number },
  current: { fractionX: number; fractionY: number },
): SymbolShape {
  const { fractionX: sx, fractionY: sy } = start;
  const { fractionX: cx, fractionY: cy } = current;
  switch (draft.kind) {
    case 'line':
      return { ...draft, x2: cx, y2: cy };
    case 'rect':
      return { ...draft, x: Math.min(sx, cx), y: Math.min(sy, cy), width: Math.abs(cx - sx), height: Math.abs(cy - sy) };
    case 'circle':
    case 'arc':
      return { ...draft, radius: Math.hypot(cx - sx, cy - sy) };
    case 'text':
      return draft;
    case 'arrow':
      return { ...draft, x2: cx, y2: cy };
    case 'ellipse': {
      const x = Math.min(sx, cx);
      const y = Math.min(sy, cy);
      const width = Math.abs(cx - sx);
      const height = Math.abs(cy - sy);
      return { ...draft, cx: x + width / 2, cy: y + height / 2, radiusX: width / 2, radiusY: height / 2 };
    }
    case 'polygon':
      return draft;
  }
}

export function isDraftLargeEnough(draft: SymbolShape): boolean {
  const MIN_FRACTION = 0.01;
  switch (draft.kind) {
    case 'line':
      return Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) >= MIN_FRACTION;
    case 'rect':
      return draft.width >= MIN_FRACTION && draft.height >= MIN_FRACTION;
    case 'circle':
    case 'arc':
      return draft.radius >= MIN_FRACTION;
    case 'text':
      return true;
    case 'arrow':
      return Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) >= MIN_FRACTION;
    case 'ellipse':
      return draft.radiusX >= MIN_FRACTION && draft.radiusY >= MIN_FRACTION;
    case 'polygon':
      // Unreachable via the draft-shape flow — Polygon uses its own click-accumulate state instead.
      return true;
  }
}

/** Combined bounding box of a whole selection — single shape or multi. */
export function selectionBounds(shapes: SymbolShape[]): { x: number; y: number; width: number; height: number } {
  const bounds = shapes.map(symbolShapeBounds);
  const minX = Math.min(...bounds.map((b) => b.x));
  const minY = Math.min(...bounds.map((b) => b.y));
  const maxX = Math.max(...bounds.map((b) => b.x + b.width));
  const maxY = Math.max(...bounds.map((b) => b.y + b.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Single-shape pivot is its own bounds center; multi-selection pivot is the combined bounding-box center — shared rule for mirror, scale, and (group) rotate. */
export function selectionPivot(shapes: SymbolShape[]): { x: number; y: number } {
  const b = selectionBounds(shapes);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

export function mirrorShape(shape: SymbolShape, axis: 'horizontal' | 'vertical', pivotX: number, pivotY: number): SymbolShape {
  const mx = (x: number) => (axis === 'horizontal' ? 2 * pivotX - x : x);
  const my = (y: number) => (axis === 'vertical' ? 2 * pivotY - y : y);
  // A reflection always reverses handedness, so a shape's own `rotation` (applied on top of
  // its raw coordinates, see shapeCenter/drawSymbolShapes) flips sign regardless of axis —
  // the axis itself is already accounted for by mx/my above.
  const rotation = shape.rotation ? -shape.rotation : shape.rotation;
  switch (shape.kind) {
    case 'line':
    case 'arrow':
      return { ...shape, x1: mx(shape.x1), y1: my(shape.y1), x2: mx(shape.x2), y2: my(shape.y2), rotation };
    case 'rect': {
      const x1 = mx(shape.x);
      const y1 = my(shape.y);
      const x2 = mx(shape.x + shape.width);
      const y2 = my(shape.y + shape.height);
      return { ...shape, x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), rotation };
    }
    case 'circle':
      return { ...shape, cx: mx(shape.cx), cy: my(shape.cy) };
    case 'arc': {
      // Reflecting reverses the sweep's orientation — mirror each bound angle, then
      // swap start/end so the arc still traces the same wedge of the (now-mirrored) circle.
      const mirrorAngle = (theta: number) => (axis === 'horizontal' ? Math.PI - theta : -theta);
      return { ...shape, cx: mx(shape.cx), cy: my(shape.cy), startAngle: mirrorAngle(shape.endAngle), endAngle: mirrorAngle(shape.startAngle), rotation };
    }
    case 'text': {
      // Text stays upright/readable — only its anchor position mirrors, not the glyphs.
      const approxWidth = shape.text.length * shape.fontSize * 0.6;
      const x1 = mx(shape.x);
      const y1 = my(shape.y);
      const x2 = mx(shape.x + approxWidth);
      const y2 = my(shape.y + shape.fontSize);
      return { ...shape, x: Math.min(x1, x2), y: Math.min(y1, y2), rotation };
    }
    case 'ellipse':
      return { ...shape, cx: mx(shape.cx), cy: my(shape.cy), rotation };
    case 'polygon':
      return { ...shape, points: shape.points.map((p) => ({ x: mx(p.x), y: my(p.y) })), rotation };
  }
}

export function scaleShape(shape: SymbolShape, factor: number, pivotX: number, pivotY: number): SymbolShape {
  const sx = (x: number) => pivotX + (x - pivotX) * factor;
  const sy = (y: number) => pivotY + (y - pivotY) * factor;
  switch (shape.kind) {
    case 'line':
    case 'arrow':
      return { ...shape, x1: sx(shape.x1), y1: sy(shape.y1), x2: sx(shape.x2), y2: sy(shape.y2) };
    case 'rect':
      return { ...shape, x: sx(shape.x), y: sy(shape.y), width: shape.width * factor, height: shape.height * factor };
    case 'circle':
      return { ...shape, cx: sx(shape.cx), cy: sy(shape.cy), radius: shape.radius * factor };
    case 'arc':
      return { ...shape, cx: sx(shape.cx), cy: sy(shape.cy), radius: shape.radius * factor };
    case 'text':
      return { ...shape, x: sx(shape.x), y: sy(shape.y), fontSize: shape.fontSize * factor };
    case 'ellipse':
      return { ...shape, cx: sx(shape.cx), cy: sy(shape.cy), radiusX: shape.radiusX * factor, radiusY: shape.radiusY * factor };
    case 'polygon':
      return { ...shape, points: shape.points.map((p) => ({ x: sx(p.x), y: sy(p.y) })) };
  }
}

export function translateShape(shape: SymbolShape, dx: number, dy: number): SymbolShape {
  switch (shape.kind) {
    case 'line':
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
    case 'rect':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'circle':
    case 'arc':
    case 'ellipse':
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case 'text':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
    case 'arrow':
      return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
    case 'polygon':
      return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
}

/**
 * Revolves a shape's own center around an external pivot by `deltaRotation` and adds the same
 * delta to its `rotation` field. Single-shape rotate and group rotate are the same operation:
 * when `pivotX/pivotY` is the shape's own center (single-select — see `selectionPivot`), the
 * revolve step is a no-op and only `rotation` changes; for a group pivot, every selected shape
 * both revolves around the shared point and spins in place by the same amount.
 */
export function rotateShapeAround(shape: SymbolShape, deltaRotation: number, pivotX: number, pivotY: number): SymbolShape {
  const center = shapeCenter(shape);
  const newCenter = rotatePoint(center.x, center.y, pivotX, pivotY, deltaRotation);
  const moved = translateShape(shape, newCenter.x - center.x, newCenter.y - center.y);
  return { ...moved, rotation: (shape.rotation ?? 0) + deltaRotation };
}

/**
 * Old app's Arc (3-pt) sub-mode: start point, end point, a point the arc passes through.
 * Computes the circle through all three (standard circumcenter formula) and derives
 * startAngle/endAngle so the sweep from start to end (in the direction drawSymbolShapes'
 * `ctx.ellipse` sweeps, i.e. increasing angle) passes through the third point.
 * Returns null for (near-)collinear points, which have no well-defined circumcircle.
 */
export function arcFromThreePoints(
  start: { fractionX: number; fractionY: number },
  end: { fractionX: number; fractionY: number },
  through: { fractionX: number; fractionY: number },
  style: SymbolShapeStyle,
): SymbolShape | null {
  const MIN_RADIUS = 0.01;
  const d =
    2 *
    (start.fractionX * (end.fractionY - through.fractionY) +
      end.fractionX * (through.fractionY - start.fractionY) +
      through.fractionX * (start.fractionY - end.fractionY));
  if (Math.abs(d) < 1e-9) return null;

  const sq1 = start.fractionX ** 2 + start.fractionY ** 2;
  const sq2 = end.fractionX ** 2 + end.fractionY ** 2;
  const sq3 = through.fractionX ** 2 + through.fractionY ** 2;
  const cx = (sq1 * (end.fractionY - through.fractionY) + sq2 * (through.fractionY - start.fractionY) + sq3 * (start.fractionY - end.fractionY)) / d;
  const cy = (sq1 * (through.fractionX - end.fractionX) + sq2 * (start.fractionX - through.fractionX) + sq3 * (end.fractionX - start.fractionX)) / d;
  const radius = Math.hypot(start.fractionX - cx, start.fractionY - cy);
  if (radius < MIN_RADIUS) return null;

  const twoPi = Math.PI * 2;
  const normalizeAngle = (a: number) => ((a % twoPi) + twoPi) % twoPi;
  const aStart = normalizeAngle(Math.atan2(start.fractionY - cy, start.fractionX - cx));
  const aEnd = normalizeAngle(Math.atan2(end.fractionY - cy, end.fractionX - cx));
  const aThrough = normalizeAngle(Math.atan2(through.fractionY - cy, through.fractionX - cx));
  const forwardSweep = normalizeAngle(aEnd - aStart);
  const throughOffset = normalizeAngle(aThrough - aStart);

  const onForwardSweep = throughOffset <= forwardSweep;
  const startAngle = onForwardSweep ? aStart : aEnd;
  const endAngle = onForwardSweep ? aStart + forwardSweep : aEnd + (twoPi - forwardSweep);

  return { id: crypto.randomUUID(), kind: 'arc', cx, cy, radius, startAngle, endAngle, style };
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSq));
  const nearX = x1 + t * dx;
  const nearY = y1 + t * dy;
  return Math.hypot(px - nearX, py - nearY);
}
