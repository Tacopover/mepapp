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
    }
  }
  return null;
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
  }
}

export type ShapeDrawTool = 'line' | 'rect' | 'circle' | 'arc';

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
      return { ...shape, cx: shape.cx + dx, cy: shape.cy + dy };
    case 'text':
      return { ...shape, x: shape.x + dx, y: shape.y + dy };
  }
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
