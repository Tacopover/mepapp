import { useRef, type JSX, type KeyboardEvent } from 'react';
import type { LinePattern } from '@mepapp/core';
import type { DiagramLayout, DotStatus, RisersLayout } from '../riserDiagram.js';

export interface BuildingRisersDiagramProps {
  layout: DiagramLayout;
  lanes: RisersLayout;
  selectedId: string | null;
  onSelect: (riserId: string) => void;
  /** Called after onSelect when Enter or Space is pressed on a lane. */
  onActivate?: (riserId: string) => void;
  /** Text for aria-label of each lane, by riser id, for example 'Supply air riser 1, Basement to Level 2, 4 levels'. */
  laneAria: ReadonlyMap<string, string>;
}

const DASH_ARRAYS: Record<LinePattern, string | undefined> = {
  solid: undefined,
  dashed: '12 6',
  dotted: '2 6',
  longDash: '24 8',
  dashDot: '14 5 2 5',
  dashDotDot: '14 5 2 5 2 5',
};

const LABEL_MAX_CHARS = 14;

const LEGEND_ROWS: { status: DotStatus; text: string }[] = [
  { status: 'ok', text: 'at position' },
  { status: 'waiting', text: 'waiting' },
  { status: 'off', text: 'not at position' },
];

/** SVG stroke-dasharray for a pattern: solid -> undefined; dashed '12 6'; dotted '2 6'; longDash '24 8'; dashDot '14 5 2 5'; dashDotDot '14 5 2 5 2 5'. Use strokeLinecap 'butt' (dotted looks as squares of 2 wide; use stroke width 4). */
export function dashArrayOf(pattern: LinePattern): string | undefined {
  return DASH_ARRAYS[pattern];
}

/** 'Supply air riser 1' -> 'Supply air 1' (removes ' riser ' before the number). A label without ' riser ' stays as it is. */
export function shortLabel(label: string): string {
  return label.replace(' riser ', ' ');
}

function labelText(label: string): string {
  const text = shortLabel(label);
  return text.length > LABEL_MAX_CHARS ? `${text.slice(0, LABEL_MAX_CHARS - 1)}…` : text;
}

interface DotShapeProps {
  cx: number;
  cy: number;
  status: DotStatus;
  color: string;
}

function DotShape({ cx, cy, status, color }: DotShapeProps) {
  return (
    <g className="mep-rd-dot">
      <circle
        className={`mep-rd-dot-ring mep-rd-dot-ring--${status}`}
        cx={cx}
        cy={cy}
        r={7}
        strokeWidth={3}
        style={status === 'ok' ? { stroke: color } : undefined}
      />
      {status === 'waiting' && <circle className="mep-rd-dot-mark mep-rd-dot-mark--waiting" cx={cx} cy={cy} r={2.5} />}
      {status === 'off' && (
        <g className="mep-rd-dot-mark mep-rd-dot-mark--off">
          <line x1={cx - 3} y1={cy - 3} x2={cx + 3} y2={cy + 3} />
          <line x1={cx + 3} y1={cy - 3} x2={cx - 3} y2={cy + 3} />
        </g>
      )}
    </g>
  );
}

/** The building diagram of the Risers tab: levels, level lines, one line per riser and a dot per level. */
export function BuildingRisersDiagram(props: BuildingRisersDiagramProps): JSX.Element {
  const { layout, lanes, selectedId, onSelect, onActivate, laneAria } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const selectedLane = lanes.lanes.find((lane) => lane.riserId === selectedId);
  const focusId = selectedLane ? selectedLane.riserId : lanes.lanes[0]?.riserId;

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const { length } = lanes.lanes;
    if (length === 0) return;
    const focusedId = (event.target as Element).closest('[data-riser-id]')?.getAttribute('data-riser-id') ?? selectedId;
    const index = Math.max(0, lanes.lanes.findIndex((lane) => lane.riserId === focusedId));
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (index + 1) % length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (index - 1 + length) % length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        onSelect(lanes.lanes[index]!.riserId);
        onActivate?.(lanes.lanes[index]!.riserId);
        return;
      default:
        return;
    }
    event.preventDefault();
    const id = lanes.lanes[next]!.riserId;
    onSelect(id);
    requestAnimationFrame(() => svgRef.current?.querySelector<SVGElement>(`[data-riser-id="${id}"]`)?.focus());
  }

  return (
    <div className="mep-rd">
      <div className="mep-rd-levels" style={{ height: layout.heightPx + 2 }}>
        {layout.levels.map((level) => (
          <div key={level.id} className="mep-rd-level" style={{ top: level.yPx }}>
            <div className="mep-rd-level-name" title={level.name}>{level.name}</div>
            <div className="mep-rd-level-elev">{level.elevationText}</div>
          </div>
        ))}
      </div>
      <div className="mep-rd-main">
        <div className="mep-rd-scroll">
          <svg
            ref={svgRef}
            width={lanes.widthPx}
            height={layout.heightPx}
            role="radiogroup"
            aria-label="Risers"
            onKeyDown={onKeyDown}
          >
            <rect className="mep-rd-frame" x={1} y={1} width={lanes.widthPx - 2} height={layout.heightPx - 2} />
            {layout.levelLinesPx.map((y, index) => (
              <line key={index} className="mep-rd-level-line" x1={0} x2={lanes.widthPx} y1={y} y2={y} />
            ))}
            {selectedLane && (
              <rect
                className="mep-rd-halo"
                aria-hidden="true"
                x={selectedLane.xPx - 15}
                y={selectedLane.topPx - 15}
                width={30}
                height={selectedLane.bottomPx - selectedLane.topPx + 30}
                rx={15}
              />
            )}
            {lanes.lanes.map((lane) => {
              const isSelected = lane.riserId === selectedId;
              return (
                <g
                  key={lane.riserId}
                  className="mep-rd-lane"
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={laneAria.get(lane.riserId) ?? lane.label}
                  tabIndex={lane.riserId === focusId ? 0 : -1}
                  data-riser-id={lane.riserId}
                  onClick={() => onSelect(lane.riserId)}
                >
                  <rect className="mep-rd-hit" x={lane.xPx - 22} y={0} width={44} height={layout.heightPx} />
                  <rect
                    className="mep-rd-focus"
                    aria-hidden="true"
                    x={lane.xPx - 18}
                    y={lane.topPx - 16}
                    width={36}
                    height={lane.bottomPx - lane.topPx + 32}
                    rx={6}
                  />
                  <line
                    x1={lane.xPx}
                    y1={lane.topPx}
                    x2={lane.xPx}
                    y2={lane.bottomPx}
                    style={{ stroke: lane.color }}
                    strokeWidth={4}
                    strokeLinecap="butt"
                    strokeDasharray={dashArrayOf(lane.linePattern)}
                  />
                  <title>{lane.label}</title>
                  <text
                    className="mep-rd-lane-label"
                    x={lane.xPx}
                    y={16}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={isSelected ? 700 : 600}
                  >
                    {labelText(lane.label)}
                  </text>
                  {lane.dots.map((dot) => (
                    <DotShape key={`${dot.levelId}|${dot.sheetId}`} cx={lane.xPx} cy={dot.yPx} status={dot.status} color={lane.color} />
                  ))}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="mep-rd-legend" aria-hidden="true">
          {LEGEND_ROWS.map((row) => (
            <div key={row.status} className="mep-rd-legend-row">
              <svg className="mep-rd-legend-dot" width={18} height={18} viewBox="0 0 18 18">
                <DotShape cx={9} cy={9} status={row.status} color="var(--ink)" />
              </svg>
              <span>{row.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
