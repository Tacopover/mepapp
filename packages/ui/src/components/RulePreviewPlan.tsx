import { useId } from 'react';
import { ceilingGridOf, closePointIndexes, roomBounds, type Calibration, type PlannedStamp, type Room, type Vec2 } from '@mepapp/core';

/** How the whole-floor view colours a room. */
export type PreviewRoomState = 'match' | 'missing' | 'problem' | 'noMatch' | 'noType';

export interface RulePreviewPlanProps {
  /** 'room' = the sample room with its neighbours dimmed; 'floor' = every room of the page. */
  mode: 'room' | 'floor';
  /** The stamps are of an older draft: a new calculation runs. The stamps show dimmed. */
  busy?: boolean;
  /** The rooms of the shown page. */
  rooms: readonly Room[];
  sample: Room | null;
  calibration: Calibration | null;
  roomState: (room: Room) => PreviewRoomState;
  /** The planned stamps to draw, in page points. */
  stamps: readonly PlannedStamp[];
  stampSizePt: { width: number; height: number };
  /** The thumbnail of the rule's stamp; null draws an outline only. */
  stampIconUrl: string | null;
  wallOffsetM: number;
  /** By coverage: the radius of the circle each stamp covers, m. */
  coverageRadiusM: number | null;
  /** Step 4: the min distance between stamps, m. Each stamp gets a circle of half this radius; circles that overlap are red. */
  minSpacingM?: number | null;
  /** The tile size of the rule's ceiling grid, mm: the sample room shows the tile lines. Null = no ceiling grid. */
  ceilingGridMm?: number | null;
  onPickRoom: (roomId: string) => void;
}

const ringPath = (ring: readonly Vec2[]) => `M${ring.map((p) => `${p.x} ${p.y}`).join('L')}Z`;
// The path of each room polygon, made once: the plan draws all rooms of the page on each key press.
const pathCache = new WeakMap<Room['polygon'], string>();
const roomPath = (room: Room) => {
  let d = pathCache.get(room.polygon);
  if (d === undefined) pathCache.set(room.polygon, (d = [room.polygon.outer, ...room.polygon.holes].map(ringPath).join('')));
  return d;
};

const STATE_FILL: Record<PreviewRoomState, string> = {
  match: 'var(--accent-soft)',
  missing: 'var(--guide-warn-soft)',
  problem: 'var(--guide-bad-soft)',
  noMatch: 'var(--surface)',
  noType: 'var(--surface)',
};

/** Above this number of stamps the plan draws one simple mark per stamp, in one path, instead of the stamp art. */
const SIMPLE_MARKS_ABOVE = 300;
/** Above this number of tile lines the plan does not draw the ceiling grid: the lines are too close to see. */
const MAX_GRID_LINES = 400;

/** The tile lines of the ceiling grid of the room, as one SVG path, or null. */
function ceilingGridPath(room: Room, sizePt: number): string | null {
  const grid = ceilingGridOf(room, sizePt);
  if (!grid) return null;
  const g = grid.size;
  const n = Math.ceil(grid.halfLength / g) + 1;
  const m = Math.ceil(grid.halfWidth / g) + 1;
  if (2 * (n + m) > MAX_GRID_LINES) return null;
  const pt = (a: number, b: number) => `${grid.center.x + grid.u.x * a + grid.v.x * b} ${grid.center.y + grid.u.y * a + grid.v.y * b}`;
  const parts: string[] = [];
  for (let i = -n; i < n; i++) parts.push(`M${pt((i + 0.5) * g, -m * g)}L${pt((i + 0.5) * g, m * g)}`);
  for (let j = -m; j < m; j++) parts.push(`M${pt(-n * g, (j + 0.5) * g)}L${pt(n * g, (j + 0.5) * g)}`);
  return parts.join('');
}

/**
 * An SVG drawing of the rooms of the page in page points (room-placement-guide.md Phase B): the
 * sample room with its wall offset band, the dimensions of its bounding rectangle and the planned
 * stamps, or the whole floor coloured by how the rule sees each room. A click on a room picks it.
 */
export function RulePreviewPlan({ mode, busy = false, rooms, sample, calibration, roomState, stamps, stampSizePt, stampIconUrl, wallOffsetM, coverageRadiusM, minSpacingM = null, ceilingGridMm = null, onPickRoom }: RulePreviewPlanProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const focus = mode === 'room' && sample ? [sample] : rooms;
  if (focus.length === 0) return <p className="mep-settings-hint">This page has no rooms. Detect the rooms first.</p>;
  const boxes = focus.map((r) => roomBounds(r));
  const box = { minX: Math.min(...boxes.map((b) => b.minX)), minY: Math.min(...boxes.map((b) => b.minY)), maxX: Math.max(...boxes.map((b) => b.maxX)), maxY: Math.max(...boxes.map((b) => b.maxY)) };
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const pad = mode === 'room' ? Math.max(w, h) * 0.22 : Math.max(w, h) * 0.03;
  const viewBox = [box.minX - pad, box.minY - pad, w + 2 * pad, h + 2 * pad];
  const unit = Math.max(viewBox[2]!, viewBox[3]!) / 100;
  const ptPerM = calibration ? 1000 * calibration.pageUnitsPerRealUnit : null;
  const offsetPt = ptPerM !== null ? wallOffsetM * ptPerM : 0;
  const radiusPt = ptPerM !== null && coverageRadiusM !== null ? coverageRadiusM * ptPerM : null;
  const minPt = ptPerM !== null && minSpacingM ? minSpacingM * ptPerM : null;
  const close = minPt !== null ? closePointIndexes(stamps.map((s) => s.position), minPt) : new Set<number>();
  const gridPath = mode === 'room' && sample && ptPerM !== null && ceilingGridMm ? ceilingGridPath(sample, (ceilingGridMm / 1000) * ptPerM) : null;
  const simple = stamps.length > SIMPLE_MARKS_ABOVE;
  const metres = (pt: number) => (ptPerM !== null ? `${(pt / ptPerM).toFixed(2)} m` : `${Math.round(pt)} pt`);
  const fontSize = unit * 3;
  const sw = Math.max(stampSizePt.width, unit);
  const sh = Math.max(stampSizePt.height, unit);

  return (
    <svg className="mep-guide-plan" viewBox={viewBox.join(' ')} role="img" aria-label={mode === 'room' && sample ? 'Sample room' : 'Rooms of the page'} data-testid="guide-plan" data-mode={mode} data-busy={busy || undefined}>
      <defs>
        <pattern id={`hatch${uid}`} width={unit * 2} height={unit * 2} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={unit * 2} stroke="var(--guide-warn)" strokeWidth={unit * 0.4} />
        </pattern>
        {sample && (
          <clipPath id={`clip${uid}`}>
            <path d={roomPath(sample)} clipRule="evenodd" />
          </clipPath>
        )}
      </defs>
      {rooms.map((room) => {
        const state = roomState(room);
        const isSample = room.id === sample?.id;
        const dim = mode === 'room' && !isSample;
        return (
          <path
            key={room.id}
            d={roomPath(room)}
            fillRule="evenodd"
            fill={state === 'noType' ? `url(#hatch${uid})` : dim && (state === 'match' || state === 'problem') ? 'var(--surface-2)' : STATE_FILL[mode === 'room' && state === 'problem' ? 'match' : state]}
            opacity={dim ? 0.55 : 1}
            stroke="var(--ink)"
            strokeWidth={isSample && mode === 'floor' ? 2.5 : 1}
            vectorEffect="non-scaling-stroke"
            className="mep-guide-plan-room"
            data-room={room.id}
            data-state={state}
            onClick={() => onPickRoom(room.id)}
          >
            <title>{[room.number, room.name].filter(Boolean).join(' ') || room.id}</title>
          </path>
        );
      })}
      {mode === 'room' && sample && (
        <>
          {offsetPt > 0 && <path d={roomPath(sample)} fill="none" stroke="var(--guide-band)" strokeWidth={2 * offsetPt} clipPath={`url(#clip${uid})`} pointerEvents="none" data-testid="guide-offset-band" />}
          {gridPath && <path d={gridPath} fill="none" stroke="var(--muted)" strokeOpacity={0.6} strokeWidth={0.75} vectorEffect="non-scaling-stroke" clipPath={`url(#clip${uid})`} pointerEvents="none" data-testid="guide-ceiling-grid" data-size={ceilingGridMm} />}
          <line x1={box.minX} y1={box.maxY + unit * 5} x2={box.maxX} y2={box.maxY + unit * 5} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          <line x1={box.maxX + unit * 5} y1={box.minY} x2={box.maxX + unit * 5} y2={box.maxY} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {[box.minX, box.maxX].map((x) => (
            <line key={`tx${x}`} x1={x} y1={box.maxY + unit * 4} x2={x} y2={box.maxY + unit * 6} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {[box.minY, box.maxY].map((y) => (
            <line key={`ty${y}`} x1={box.maxX + unit * 4} y1={y} x2={box.maxX + unit * 6} y2={y} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          <text x={(box.minX + box.maxX) / 2} y={box.maxY + unit * 9} fontSize={fontSize} textAnchor="middle" className="mep-guide-plan-dim" data-testid="guide-dim-x">
            {metres(box.maxX - box.minX)}
          </text>
          <text transform={`translate(${box.maxX + unit * 8} ${(box.minY + box.maxY) / 2}) rotate(90)`} fontSize={fontSize} textAnchor="middle" className="mep-guide-plan-dim" data-testid="guide-dim-y">
            {metres(box.maxY - box.minY)}
          </text>
          <text x={box.minX} y={box.minY - unit * 3} fontSize={fontSize * 1.1} className="mep-guide-plan-name">
            {[sample.number, sample.name].filter(Boolean).join(' ') || sample.id}
          </text>
          {radiusPt !== null &&
            stamps.map((s, i) => (
              <circle key={`c${i}`} cx={s.position.x} cy={s.position.y} r={radiusPt} fill="var(--accent)" fillOpacity={0.07} stroke="var(--accent)" strokeDasharray="4 3" strokeWidth={1} vectorEffect="non-scaling-stroke" clipPath={`url(#clip${uid})`} pointerEvents="none" data-testid="guide-coverage-circle" />
            ))}
          {minPt !== null &&
            !simple &&
            stamps.map((s, i) => {
              const color = close.has(i) ? 'var(--guide-bad)' : 'var(--guide-ok)';
              return (
                <circle key={`g${i}`} cx={s.position.x} cy={s.position.y} r={minPt / 2} fill={color} fillOpacity={close.has(i) ? 0.22 : 0.12} stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" data-testid="guide-gap-circle" data-close={close.has(i) || undefined} />
              );
            })}
        </>
      )}
      {simple && (
        <path
          className="mep-guide-plan-stamps"
          d={stamps.map((s) => `M${s.position.x - sw / 2} ${s.position.y - sh / 2}h${sw}v${sh}h${-sw}Z`).join('')}
          fill="var(--hvac)"
          fillOpacity={0.5}
          pointerEvents="none"
          data-testid="guide-stamp-marks"
          data-stamps={stamps.length}
        />
      )}
      {!simple && stamps.map((s, i) => (
        <g key={i} className="mep-guide-plan-stamps" transform={`translate(${s.position.x} ${s.position.y}) rotate(${s.rotationDegrees})`} pointerEvents="none" data-testid="guide-stamp">
          {stampIconUrl && <image href={stampIconUrl} x={-sw / 2} y={-sh / 2} width={sw} height={sh} preserveAspectRatio="xMidYMid meet" />}
          <rect x={-sw / 2} y={-sh / 2} width={sw} height={sh} fill={stampIconUrl ? 'none' : 'var(--surface)'} stroke={close.has(i) ? 'var(--guide-bad)' : 'var(--hvac)'} strokeWidth={1.2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" />
          {!stampIconUrl && (
            <path d={`M${-sw / 2} ${-sh / 2}L${sw / 2} ${sh / 2}M${sw / 2} ${-sh / 2}L${-sw / 2} ${sh / 2}`} stroke="var(--hvac)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          )}
        </g>
      ))}
    </svg>
  );
}
