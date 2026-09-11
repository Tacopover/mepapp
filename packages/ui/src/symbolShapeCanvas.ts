// Draw/rasterize routines for the Element Editor dialog's Shapes mode
// (ports-custom-element-editor-spec.md §5.3). One shared draw routine backs
// both the live editing canvas (ElementEditorDialog) and the final rasterize-
// to-iconRef step on save — SymbolShape's fractional coordinates make it
// resolution-independent, so the same function just gets called at a
// different canvas pixel size for each.

import type { SymbolShape, SymbolShapeStyle } from '@mepapp/core';

export function drawSymbolShapes(ctx: CanvasRenderingContext2D, shapes: SymbolShape[], widthPx: number, heightPx: number): void {
  for (const shape of shapes) {
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
    const x = fractionX * widthPx;
    const y = fractionY * heightPx;
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

export function symbolShapeBounds(shape: SymbolShape): { x: number; y: number; width: number; height: number } {
  switch (shape.kind) {
    case 'line':
      return {
        x: Math.min(shape.x1, shape.x2),
        y: Math.min(shape.y1, shape.y2),
        width: Math.abs(shape.x2 - shape.x1),
        height: Math.abs(shape.y2 - shape.y1),
      };
    case 'rect':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case 'circle':
    case 'arc':
      return { x: shape.cx - shape.radius, y: shape.cy - shape.radius, width: shape.radius * 2, height: shape.radius * 2 };
    case 'text':
      return { x: shape.x, y: shape.y, width: shape.text.length * shape.fontSize * 0.6, height: shape.fontSize };
    case 'arrow':
      return {
        x: Math.min(shape.x1, shape.x2),
        y: Math.min(shape.y1, shape.y2),
        width: Math.abs(shape.x2 - shape.x1),
        height: Math.abs(shape.y2 - shape.y1),
      };
    case 'ellipse':
      return { x: shape.cx - shape.radiusX, y: shape.cy - shape.radiusY, width: shape.radiusX * 2, height: shape.radiusY * 2 };
    case 'polygon': {
      const xs = shape.points.map((p) => p.x);
      const ys = shape.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
    }
  }
}

export type ShapeDrawTool = 'line' | 'rect' | 'circle' | 'arc' | 'ellipse' | 'arrow';

/** Creates a zero-size shape at the drag's start point; updateDraftShape grows it as the pointer moves. */
export function createDraftShape(tool: ShapeDrawTool, id: string, start: { fractionX: number; fractionY: number }, style: SymbolShapeStyle): SymbolShape {
  const { fractionX: x, fractionY: y } = start;
  switch (tool) {
    case 'line':
      return { id, kind: 'line', x1: x, y1: y, x2: x, y2: y, style };
    case 'rect':
      return { id, kind: 'rect', x, y, width: 0, height: 0, style };
    case 'circle':
      return { id, kind: 'circle', cx: x, cy: y, radius: 0, style };
    case 'arc':
      // Default 270° sweep — fine-tuned afterward via the selected shape's angle inputs, same as the old app's arc tool needed a second adjustment step.
      return { id, kind: 'arc', cx: x, cy: y, radius: 0, startAngle: 0, endAngle: (Math.PI * 3) / 2, style };
    case 'arrow':
      return { id, kind: 'arrow', x1: x, y1: y, x2: x, y2: y, style };
    case 'ellipse':
      return { id, kind: 'ellipse', cx: x, cy: y, radiusX: 0, radiusY: 0, style };
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
