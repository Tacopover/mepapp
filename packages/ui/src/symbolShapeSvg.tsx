// SVG renderer adapter for SymbolShape (shared-drawing-tool.md §4/§5, Phase 2) — the shared
// drawing tool's live editing surface for the two schematic consumers (and, per §4, eventually
// the stamp editor too). Not wired into any consumer yet. Mirrors packages/ui/src/
// symbolShapeCanvas.ts's drawSymbolShapes exactly (same fraction-space -> px scaling, same
// per-kind stroke/fill rules, same rotation-about-shapeCenter convention) but emits real SVG
// elements instead of Canvas2D calls. One deliberate difference: an 'image' shape's dataUrl is
// handed straight to a native <image href>, since SVG (unlike Canvas2D's synchronous draw call)
// doesn't need a pre-decoded HTMLImageElement cache to render one — the browser loads it like
// any other <img>, so there's no "not loaded yet" placeholder-rect case to reproduce here.
import type { JSX } from 'react';
import { shapeCenter, type SymbolShape } from '@mepapp/core';

/** Canvas2D's `Math.max(1, strokeWidth * Math.min(widthPx, heightPx))` convention, unchanged. */
function strokeWidthPx(shape: SymbolShape, widthPx: number, heightPx: number): number {
  return Math.max(1, shape.style.strokeWidth * Math.min(widthPx, heightPx));
}

function rotationTransform(shape: SymbolShape, widthPx: number, heightPx: number): string | undefined {
  const rotation = shape.rotation ?? 0;
  if (rotation === 0) return undefined;
  const center = shapeCenter(shape);
  const deg = (rotation * 180) / Math.PI;
  return `rotate(${deg} ${center.x * widthPx} ${center.y * heightPx})`;
}

/** SVG elliptical-arc path `d` for a circle of radius r swept from startAngle to endAngle
    (radians), matching Canvas2D's `ctx.ellipse(cx, cy, r, r, 0, startAngle, endAngle)` — always
    swept in the increasing-angle direction (sweep-flag 1, consistent with both Canvas2D and
    SVG sharing a y-down coordinate system), wrapping past 2*PI if endAngle < startAngle. A
    sweep of (near) a full turn can't be expressed as one arc command (degenerate start==end
    point) — the caller falls back to a full circle in that case. */
function describeArcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  let delta = (endAngle - startAngle) % (Math.PI * 2);
  if (delta <= 0) delta += Math.PI * 2;
  const startX = cx + r * Math.cos(startAngle);
  const startY = cy + r * Math.sin(startAngle);
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy + r * Math.sin(endAngle);
  const largeArcFlag = delta > Math.PI ? 1 : 0;
  return `M ${startX} ${startY} A ${r} ${r} 0 ${largeArcFlag} 1 ${endX} ${endY}`;
}

const FULL_TURN_EPSILON = 1e-6;

/** Renders one SymbolShape as an SVG element, matching drawSymbolShapes' per-kind semantics. */
export function renderSymbolShapeSvg(shape: SymbolShape, widthPx: number, heightPx: number): JSX.Element {
  const stroke = shape.style.stroke;
  const fill = shape.style.fill ?? 'none';
  const lineWidth = strokeWidthPx(shape, widthPx, heightPx);
  const transform = rotationTransform(shape, widthPx, heightPx);

  switch (shape.kind) {
    case 'line':
      return (
        <line
          transform={transform}
          x1={shape.x1 * widthPx}
          y1={shape.y1 * heightPx}
          x2={shape.x2 * widthPx}
          y2={shape.y2 * heightPx}
          stroke={stroke}
          strokeWidth={lineWidth}
        />
      );
    case 'rect':
      return (
        <rect
          transform={transform}
          x={shape.x * widthPx}
          y={shape.y * heightPx}
          width={shape.width * widthPx}
          height={shape.height * heightPx}
          stroke={stroke}
          strokeWidth={lineWidth}
          fill={fill}
        />
      );
    case 'circle': {
      // Scaled by the shorter dimension, same convention strokeWidth and hitTestSymbolShape
      // already use, so it stays a true circle regardless of the canvas's aspect ratio.
      const r = shape.radius * Math.min(widthPx, heightPx);
      return (
        <circle transform={transform} cx={shape.cx * widthPx} cy={shape.cy * heightPx} r={r} stroke={stroke} strokeWidth={lineWidth} fill={fill} />
      );
    }
    case 'arc': {
      const r = shape.radius * Math.min(widthPx, heightPx);
      const cx = shape.cx * widthPx;
      const cy = shape.cy * heightPx;
      let delta = (shape.endAngle - shape.startAngle) % (Math.PI * 2);
      if (delta <= 0) delta += Math.PI * 2;
      if (delta >= Math.PI * 2 - FULL_TURN_EPSILON) {
        return <circle transform={transform} cx={cx} cy={cy} r={r} stroke={stroke} strokeWidth={lineWidth} fill="none" />;
      }
      return <path transform={transform} d={describeArcPath(cx, cy, r, shape.startAngle, shape.endAngle)} stroke={stroke} strokeWidth={lineWidth} fill="none" />;
    }
    case 'text':
      return (
        <text
          transform={transform}
          x={shape.x * widthPx}
          y={shape.y * heightPx}
          fontSize={shape.fontSize * heightPx}
          fontFamily="sans-serif"
          fill={stroke}
          dominantBaseline="hanging"
        >
          {shape.text}
        </text>
      );
    case 'arrow': {
      const x1 = shape.x1 * widthPx;
      const y1 = shape.y1 * heightPx;
      const x2 = shape.x2 * widthPx;
      const y2 = shape.y2 * heightPx;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLength = Math.max(6, lineWidth * 3);
      const headAngle = Math.PI / 7;
      const headX1 = x2 - headLength * Math.cos(angle - headAngle);
      const headY1 = y2 - headLength * Math.sin(angle - headAngle);
      const headX2 = x2 - headLength * Math.cos(angle + headAngle);
      const headY2 = y2 - headLength * Math.sin(angle + headAngle);
      return (
        <g transform={transform}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={lineWidth} />
          <polygon points={`${x2},${y2} ${headX1},${headY1} ${headX2},${headY2}`} fill={stroke} />
        </g>
      );
    }
    case 'ellipse':
      // Unlike circle/arc, each radius is scaled by its own axis's px size (matching Canvas2D's
      // ctx.ellipse(cx*w, cy*h, radiusX*w, radiusY*h, ...) — deliberately not Math.min(w,h)).
      return (
        <ellipse
          transform={transform}
          cx={shape.cx * widthPx}
          cy={shape.cy * heightPx}
          rx={shape.radiusX * widthPx}
          ry={shape.radiusY * heightPx}
          stroke={stroke}
          strokeWidth={lineWidth}
          fill={fill}
        />
      );
    case 'polygon':
      if (shape.points.length === 0) return <g />;
      return (
        <polygon
          transform={transform}
          points={shape.points.map((p) => `${p.x * widthPx},${p.y * heightPx}`).join(' ')}
          stroke={stroke}
          strokeWidth={lineWidth}
          fill={fill}
        />
      );
    case 'image':
      return (
        <image
          transform={transform}
          href={shape.dataUrl}
          x={shape.x * widthPx}
          y={shape.y * heightPx}
          width={shape.width * widthPx}
          height={shape.height * heightPx}
          preserveAspectRatio="none"
        />
      );
  }
}

export interface SymbolShapesSvgProps {
  shapes: SymbolShape[];
  widthPx: number;
  heightPx: number;
}

/** Renders a whole SymbolShape[] as one <g>, in array order (same paint-order convention as
    drawSymbolShapes — later shapes draw over earlier ones). */
export function SymbolShapesSvg({ shapes, widthPx, heightPx }: SymbolShapesSvgProps): JSX.Element {
  return (
    <g>
      {shapes.map((shape) => (
        <g key={shape.id}>{renderSymbolShapeSvg(shape, widthPx, heightPx)}</g>
      ))}
    </g>
  );
}
