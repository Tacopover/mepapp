import { riserArrowShapes, type RiserArrowStyle } from '@mepapp/render';
import type { RiserArrowPair } from '@mepapp/core';

export const PICKER_ARROW_STYLE: RiserArrowStyle = { lengthPt: 13, shaftWidthPt: 1.5, headLengthPt: 5, headWidthPt: 4, angleDeg: 60 };
export const PICKER_RING_RADIUS = 4.5;
const RING_COLOR = '#7c4dff';

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function RiserArrowIcon({ pair }: { pair: RiserArrowPair }) {
  const shapes = riserArrowShapes(pair, { x: 18, y: 18 }, PICKER_RING_RADIUS, PICKER_ARROW_STYLE);
  return (
    <svg width={36} height={36} viewBox="0 0 36 36" aria-hidden="true" focusable="false">
      <circle cx={18} cy={18} r={PICKER_RING_RADIUS} fill="none" stroke={RING_COLOR} strokeWidth={1.5} />
      {shapes.map((shape) => (
        <g key={shape.side}>
          <line
            x1={round(shape.shaftTail.x)}
            y1={round(shape.shaftTail.y)}
            x2={round(shape.shaftEnd.x)}
            y2={round(shape.shaftEnd.y)}
            stroke="currentColor"
            strokeWidth={1.5}
          />
          <polygon
            points={`${round(shape.head.tip.x)},${round(shape.head.tip.y)} ${round(shape.head.baseA.x)},${round(shape.head.baseA.y)} ${round(shape.head.baseB.x)},${round(shape.head.baseB.y)}`}
            fill="currentColor"
          />
        </g>
      ))}
    </svg>
  );
}
