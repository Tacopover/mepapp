// Test helper of gate G-P2 (P2-T12): measures the plans on the manual scenario and on the other drawings, and evaluates the criteria G1 to G15. Excluded from the build, see tsconfig.json.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';
import type { PlannedRoute } from './route-build.js';
import type { RouteLayoutOptions } from './route-layout.js';
import { crossingsAlongPath } from './route-crossings.js';
import { routeMetrics, type RouteMetrics } from './route-metrics.js';
import { polylinesOfPlan, shapeMetrics, type ShapeMetrics } from './route-shape-metrics.js';
import { buildScenario, firstFloorDrawing, localDrawing, makeIdFactories, manualScenario, runScenario, type Drawing, type Scenario, type ScenarioRun } from './route-scenario.testutil.js';
import { getStampWorldPorts } from './stamp.js';

/** The flag file of the assert test. It is git-ignored. */
export const ASSERT_FLAG = fileURLToPath(new URL('../../../.claude/roadmap/tools/p2/assert.flag', import.meta.url));
export const flagExists = (): boolean => existsSync(ASSERT_FLAG);

export const BALANCED: RouteLayoutOptions | undefined = undefined;
export const BRANCHES: RouteLayoutOptions = { roomBranches: { searchMm: 30000 } };
export const TWO_LEVEL: RouteLayoutOptions = { twoLevel: {} };

/** Single-terminal rooms that may have a bend, each with the reason (G4). Empty: the director adds a room only with a reason. */
export const G4_EXCEPTIONS: Record<string, string> = {};

export interface TerminalMm { id: string; point: Vec2; roomId: string | null; touched: boolean }

function distanceToPiece(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y);
}

/** The terminal of each target port in mm: the port point when a polyline passes within 10 page points, else the stamp centre (as gate M0). `touched` is true in the first case. */
export function terminalsFor(s: Scenario, polylinesMm: readonly (readonly Vec2[])[]): TerminalMm[] {
  const { mmPerPt } = s.drawing;
  return s.targetPorts.map((p) => {
    const port = { x: p.world.x * mmPerPt, y: p.world.y * mmPerPt };
    let nearest = Infinity;
    for (const line of polylinesMm) {
      if (line.length === 1) nearest = Math.min(nearest, Math.hypot(line[0]!.x - port.x, line[0]!.y - port.y));
      for (let i = 0; i + 1 < line.length; i++) nearest = Math.min(nearest, distanceToPiece(port, line[i]!, line[i + 1]!));
    }
    const stamp = s.stamps.find((st) => st.id === p.stampId);
    if (!stamp) throw new Error(`no stamp ${p.stampId} for a target port`);
    const centre = { x: stamp.transform.position.x * mmPerPt, y: stamp.transform.position.y * mmPerPt };
    const touched = nearest <= 10 * mmPerPt;
    return { id: `${p.stampId}:${p.portId}`, point: touched ? port : centre, roomId: p.roomId, touched };
  });
}

export function startMmOf(s: Scenario): Vec2 {
  const stamp = s.stamps.find((st) => st.id === s.startStampId);
  const world = stamp ? getStampWorldPorts(stamp).find((p) => p.id === s.startPortId)?.world : undefined;
  if (!world) throw new Error('no start port');
  return { x: world.x * s.drawing.mmPerPt, y: world.y * s.drawing.mmPerPt };
}

export interface Hole { point: Vec2; fromRoomId: string | null; toRoomId: string | null; cornerMm: number }

export interface Side {
  label: string;
  s: Scenario;
  polylinesMm: Vec2[][];
  terminals: TerminalMm[];
  shape: ShapeMetrics;
  wallCrossings: number;
  holes: Hole[];
  portsLeft: number;
  untouchedRoomIds: string[];
  warnings: Map<string, string[]>;
  plan?: PlannedRoute;
  run?: ScenarioRun;
  old?: RouteMetrics;
  portEndsOver1: string[];
  medianMs?: number;
}

function ringPoints(room: Room | undefined): Vec2[] {
  return room === undefined ? [] : [room.polygon.outer, ...room.polygon.holes].flat();
}

export function holesOf(s: Scenario, polylinesMm: readonly (readonly Vec2[])[]): Hole[] {
  const { mmPerPt, rooms } = s.drawing;
  const page = s.pageIndex;
  const byId = new Map(rooms.map((r) => [r.id, r]));
  const out: Hole[] = [];
  for (const line of polylinesMm) {
    const path = line.map((p) => ({ x: p.x / mmPerPt, y: p.y / mmPerPt }));
    for (const c of crossingsAlongPath(rooms, path, { mmPerPt, pageIndex: page }).crossings) {
      const corners = [...ringPoints(c.fromRoomId === null ? undefined : byId.get(c.fromRoomId)), ...ringPoints(c.toRoomId === null ? undefined : byId.get(c.toRoomId))];
      const cornerMm = corners.length === 0 ? Infinity : Math.min(...corners.map((q) => Math.hypot(q.x - c.point.x, q.y - c.point.y) * mmPerPt));
      out.push({ point: c.point, fromRoomId: c.fromRoomId, toRoomId: c.toRoomId, cornerMm });
    }
  }
  return out;
}

function portEnds(plan: PlannedRoute): string[] {
  const count = new Map<string, number>();
  for (const seg of plan.segments) {
    for (const end of [seg.endpointA, seg.endpointB]) {
      if (end.kind !== 'port') continue;
      const key = `${end.elementId}:${end.portId}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  return [...count.entries()].filter(([, n]) => n > 1).map(([k]) => k).sort();
}

export function measureSide(s: Scenario, label: string, polylinesMm: Vec2[][], snapMm?: number, run?: ScenarioRun): Side {
  const { mmPerPt } = s.drawing;
  const terminals = terminalsFor(s, polylinesMm);
  const shape = shapeMetrics({
    polylines: polylinesMm,
    terminalsMm: terminals,
    startMm: startMmOf(s),
    rooms: s.drawing.rooms,
    area: s.area,
    mmPerPt,
    pageIndex: s.pageIndex,
    ...(snapMm === undefined ? {} : { snapMm }),
  });
  const holes = holesOf(s, polylinesMm);
  const untouched = new Set(terminals.filter((t) => !t.touched && t.roomId !== null).map((t) => t.roomId as string));
  const warnings = new Map<string, string[]>();
  for (const w of run?.plan.warnings ?? []) warnings.set(w.code, w.ids ?? []);
  const side: Side = {
    label,
    s,
    polylinesMm,
    terminals,
    shape,
    wallCrossings: holes.length,
    holes,
    portsLeft: run ? run.plan.stats.portsLeft : terminals.filter((t) => !t.touched).length,
    untouchedRoomIds: [...untouched].sort(),
    warnings,
    portEndsOver1: run ? portEnds(run.plan) : [],
  };
  if (run) {
    side.plan = run.plan;
    side.run = run;
    side.old = routeMetrics({ plan: run.plan, rooms: s.drawing.rooms, area: s.area, mmPerPt, pageIndex: s.pageIndex, startStampId: s.startStampId, startPortId: s.startPortId });
  }
  return side;
}

export function planSide(s: Scenario, label: string, options: RouteLayoutOptions | undefined): Side {
  const run = runScenario(s, makeIdFactories(), options);
  return measureSide(s, label, polylinesOfPlan(run.plan, s.drawing.mmPerPt), undefined, run);
}

export interface ManualCase { s: Scenario; balanced: Side; branches: Side; twoLevel: Side; hand: Side }

export function loadManualCase(): ManualCase | null {
  const fixture = manualScenario();
  if (fixture === null) return null;
  const { scenario: s, manual } = fixture;
  const mmPerPt = s.drawing.mmPerPt;
  const handMm = [...manual.main, ...manual.room].map((stroke) => stroke.map((p) => ({ x: p.x * mmPerPt, y: p.y * mmPerPt })));
  return {
    s,
    balanced: planSide(s, 'Balanced', BALANCED),
    branches: planSide(s, 'roomBranches', BRANCHES),
    twoLevel: planSide(s, 'twoLevel', TWO_LEVEL),
    hand: measureSide(s, 'hand route', handMm, 4 * mmPerPt),
  };
}

export interface OtherCase { drawing: string; kind: 'A' | 'B'; balanced: Side; twoLevel: Side; medianMs: number | null }

const OTHER_SOURCES: { file: string | null; name: string }[] = [
  { file: null, name: 'first floor' },
  { file: 'ground-floor-w-rooms-2', name: 'w_rooms-2' },
];

export function loadOtherCases(load: (name: string, file: string | null) => Drawing | null): { cases: OtherCase[]; skipped: string[] } {
  const cases: OtherCase[] = [];
  const skipped: string[] = [];
  for (const spec of OTHER_SOURCES) {
    const drawing = load(spec.name, spec.file);
    if (drawing === null) {
      skipped.push(`${spec.name}: local fixture ${spec.file}.json missing`);
      continue;
    }
    for (const kind of ['A', 'B'] as const) {
      const s = buildScenario(drawing, kind, 0);
      if (s === null) {
        skipped.push(`${spec.name} ${kind}: no path room`);
        continue;
      }
      const balanced = planSide(s, 'Balanced', BALANCED);
      const twoLevel = planSide(s, 'twoLevel', TWO_LEVEL);
      let medianMs: number | null = null;
      if (kind === 'A' && spec.name === 'w_rooms-2') {
        const times = [0, 1, 2].map(() => runScenario(s, makeIdFactories(), TWO_LEVEL).ms).sort((a, b) => a - b);
        medianMs = times[1] ?? 0;
      }
      cases.push({ drawing: spec.name, kind, balanced, twoLevel, medianMs });
    }
  }
  return { cases, skipped };
}

export { localDrawing };

// ---- tee points ------------------------------------------------------------------------------------------------

export interface TeeRow { roomId: string; planTee: Vec2; handTee: Vec2; alongMm: number; perpMm: number; sameLine: boolean }

/** For each branch of the plan whose room also has a branch in the hand route: the distance between the two tees along the plan main line. */
export function teeRows(plan: Side, hand: Side): TeeRow[] {
  const rows: TeeRow[] = [];
  for (const b of plan.shape.branches) {
    const candidates = hand.shape.branches.filter((h) => h.roomId === b.roomId);
    if (candidates.length === 0) continue;
    const h = candidates.reduce((best, c) => (Math.hypot(c.teeMm.x - b.teeMm.x, c.teeMm.y - b.teeMm.y) < Math.hypot(best.teeMm.x - b.teeMm.x, best.teeMm.y - b.teeMm.y) ? c : best));
    const dx = h.teeMm.x - b.teeMm.x;
    const dy = h.teeMm.y - b.teeMm.y;
    const along = Math.abs(dx * b.alongMm.x + dy * b.alongMm.y);
    const perp = Math.abs(dx * b.alongMm.y - dy * b.alongMm.x);
    const parallel = Math.abs(b.alongMm.x * h.alongMm.y - b.alongMm.y * h.alongMm.x) < 0.1;
    rows.push({ roomId: b.roomId, planTee: b.teeMm, handTee: h.teeMm, alongMm: along, perpMm: perp, sameLine: parallel && perp <= 500 });
  }
  return rows.sort((p, q) => (p.roomId < q.roomId ? -1 : p.roomId > q.roomId ? 1 : 0));
}

// ---- criteria --------------------------------------------------------------------------------------------------

export interface GateResult { id: string; text: string; measured: string; threshold: string; pass: boolean | null; rooms: string[] }

export interface GateInput { m: ManualCase; others: OtherCase[]; skipped: string[]; handLongestPathMm: number; handLongestSource: string }

const num = (v: number, digits = 0): string => v.toFixed(digits);
const sorted = (ids: Iterable<string>): string[] => [...new Set(ids)].sort();

/** The text for one room: the facts of the plan that explain it (as causeOf of the P1 report). */
export function causeOf(side: Side, roomId: string): string {
  const sh = side.shape;
  const facts: string[] = [];
  const w = (code: string): boolean => (side.warnings.get(code) ?? []).includes(roomId);
  if (w('room-off-graph')) facts.push('off graph');
  if (w('room-chained')) facts.push(`chained (warning)${sh.chainedVia[roomId] ? ` via ${sh.chainedVia[roomId]}` : ''}`);
  if (sh.chainedRoomIds.includes(roomId)) facts.push(`chained (metric) via ${sh.chainedVia[roomId] ?? '?'}`);
  if (w('main-crosses-room')) facts.push('crossed by a main line (bridge)');
  const holes = side.plan?.stats.holesPerRoom?.[roomId];
  if (holes !== undefined) facts.push(`holes ${holes}`);
  if (sh.multiEntryRoomIds.includes(roomId)) facts.push(`${sh.multiEntryPointsMm[roomId]?.length ?? 0} entries`);
  const bends = sh.bendPlaces[roomId];
  if (bends !== undefined) facts.push(`${bends} bend(s) inside`);
  for (const b of sh.branches) {
    if (b.roomId === roomId) facts.push(`branch ${num(b.lengthMm)} mm, tee offset ${num(b.offsetMm)} mm`);
  }
  if (side.untouchedRoomIds.includes(roomId)) facts.push('a terminal is not reached');
  return `${roomId}: ${facts.join('; ') || 'no flag'}`;
}

export function evaluate(g: GateInput): GateResult[] {
  const out: GateResult[] = [];
  const t = g.m.twoLevel;
  const sh = t.shape;
  const add = (id: string, text: string, measured: string, threshold: string, pass: boolean | null, rooms: string[] = []): void => {
    out.push({ id, text, measured, threshold, pass, rooms });
  };
  const freeLegs = t.plan?.stats.freeLegs ?? 0;
  add('G1', 'no 45 degree leg and no free leg', `bends45 ${sh.bends45}, freeLegs ${freeLegs}`, '0, 0', sh.bends45 === 0 && freeLegs === 0);
  const servedBend = Object.entries(sh.bendPlaces).filter(([id]) => g.m.s.servedRooms.some((r) => r.id === id));
  const corridorBend = Object.entries(sh.bendPlaces).filter(([id]) => g.m.s.area.rooms.some((r) => r.roomId === id));
  add('G2a', 'bendsServedRooms', String(sh.bendsServedRooms), '<= 8', sh.bendsServedRooms <= 8, servedBend.map(([id]) => id));
  add('G2b', 'bendsCorridors', String(sh.bendsCorridors), '<= 7', sh.bendsCorridors <= 7, corridorBend.map(([id]) => id));
  const chainedWarned = new Set(t.warnings.get('room-chained') ?? []);
  const chainedMissing = sh.chainedRoomIds.filter((id) => !chainedWarned.has(id));
  const chainedBent = sh.chainedRoomIds.filter((id) => (sh.bendPlaces[id] ?? 0) > 1);
  add('G3a', 'chained rooms: each has the warning room-chained and a chain with at most 1 extra bend (host branch kind not verified)', `${sh.chainedRooms} chained (${sorted(sh.chainedRoomIds).join(', ')}), ${chainedMissing.length} without warning, ${chainedBent.length} with more than 1 bend`, 'warning on each; bends in the room <= 1 (proxy)', chainedMissing.length === 0 && chainedBent.length === 0, sorted([...chainedMissing, ...chainedBent]));
  add('G3b', 'multiEntryRooms', String(sh.multiEntryRooms), '<= 2', sh.multiEntryRooms <= 2, sh.multiEntryRoomIds);
  const bent = sh.singleTerminalBentRoomIds.filter((id) => G4_EXCEPTIONS[id] === undefined);
  add('G4', 'single-terminal rooms with a straight branch', `${sh.singleTerminalStraight.straight}/${sh.singleTerminalStraight.rooms} (${bent.length} without exception)`, 'all, except listed', bent.length === 0, bent);
  add('G5', 'lengthMm', num(sh.lengthMm), '<= 257000', sh.lengthMm <= 257000);
  add('G6', 'meanBendsToTerminal', num(sh.meanBendsToTerminal, 2), '<= 5', sh.meanBendsToTerminal <= 5);
  const badTees = sh.branches.filter((b) => b.offsetMm > 100).map((b) => b.roomId);
  add('G7', 'teeOffsetMm.max', num(sh.teeOffsetMm.max), '<= 100', sh.teeOffsetMm.max <= 100, sorted(badTees));
  const unfed = t.untouchedRoomIds;
  add('G8', 'portsLeft and unfed rooms', `portsLeft ${t.portsLeft}, rooms with an unreached terminal ${unfed.length}`, '0, 0', t.portsLeft === 0 && unfed.length === 0, unfed);

  const g9: string[] = [];
  for (const c of g.others) {
    const b = c.balanced.old;
    const n = c.twoLevel.old;
    if (!b || !n) continue;
    const checks: [string, boolean, string][] = [
      ['bendsOutside', n.bendsOutside <= b.bendsOutside, `${n.bendsOutside} vs ${b.bendsOutside}`],
      ['bendsArea90+45', n.bendsArea90 + n.bendsArea45 <= b.bendsArea90 + b.bendsArea45, `${n.bendsArea90 + n.bendsArea45} vs ${b.bendsArea90 + b.bendsArea45}`],
      ['lengthMm <= 120 %', n.lengthMm <= 1.2 * b.lengthMm, `${num(n.lengthMm)} vs ${num(b.lengthMm)}`],
      ['wallCrossings <= 125 %', n.wallCrossings <= 1.25 * b.wallCrossings, `${n.wallCrossings} vs ${b.wallCrossings}`],
    ];
    for (const [what, ok, detail] of checks) {
      if (!ok) g9.push(`${c.drawing} ${c.kind} ${what}: ${detail}`);
    }
  }
  add('G9', 'not worse than Balanced on the other drawings (bends outside + area, length 120 %, walls 125 %)', g.others.length === 0 ? 'no other drawing found' : g9.length === 0 ? 'all within the margin' : `${g9.length} over: ${g9.join(' | ')}`, 'as G0 C3 and C5', g.others.length === 0 ? null : g9.length === 0, []);
  const ms = g.others.find((c) => c.medianMs !== null)?.medianMs ?? null;
  add('G10', 'time, scenario A on w_rooms-2, median of 3 (asserted in P2-T14)', ms === null ? 'not measured' : `${num(ms)} ms`, '<= 600 ms (T14)', null);
  const minHole = t.holes.reduce((m, h) => Math.min(m, h.cornerMm), Infinity);
  const badHoles = t.holes.filter((h) => h.cornerMm < 200);
  add('G11', 'smallest distance wall hole to wall end or corner (printed only)', Number.isFinite(minHole) ? `${num(minHole)} mm (${t.holes.length} holes, ${badHoles.length} under 200)` : 'no hole', 'no assert', null, sorted(badHoles.flatMap((h) => [h.fromRoomId, h.toRoomId].filter((x): x is string => x !== null))));
  const limit = 1.1 * g.handLongestPathMm;
  add('G12', `longestPathFromStartMm (hand route ${num(g.handLongestPathMm)}, ${g.handLongestSource})`, num(sh.longestPathFromStartMm), `<= ${num(limit)}`, sh.longestPathFromStartMm <= limit);
  const longBranches = sh.branches.filter((b) => b.lengthMm > 6000).map((b) => b.roomId);
  add('G13', 'branchLengthP90Mm', num(sh.branchLengthP90Mm), '<= 6000', sh.branchLengthP90Mm <= 6000, sorted(longBranches));
  add('G14', 'corridorGapCrossings and holesPerRoom (printed)', `corridorGapCrossings ${t.plan?.stats.corridorGapCrossings ?? 'n/a'}, rooms with more than one hole ${Object.entries(t.plan?.stats.holesPerRoom ?? {}).filter(([, n]) => n > 1).map(([id, n]) => `${id}:${n}`).join(',') || 'none'}`, 'no assert', null);
  const allSides: Side[] = [t, ...g.others.map((c) => c.twoLevel)];
  const oldPlans = [g.m.balanced, g.m.branches, ...g.others.map((c) => c.balanced)].flatMap((side) => side.portEndsOver1.map((p) => `${side.label} ${side.s.drawing.name} ${side.s.kind}: ${p}`));
  const many = allSides.flatMap((side) => side.portEndsOver1.map((p) => `${side.label} ${side.s.drawing.name} ${side.s.kind}: ${p}`));
  add('G15', 'ports with more than one segment end (twoLevel plans: manual + other drawings; old modes printed)', `${many.length}${many.length > 0 ? ` [${many.join(', ')}]` : ''}; old modes with the fault: [${oldPlans.join(', ')}]; graph metric portsWithManyEnds ${sh.portsWithManyEnds}`, '0', many.length === 0, []);
  return out;
}

export function marginLines(others: readonly OtherCase[]): string[] {
  return others.map((c) => {
    const b = c.balanced.old;
    const n = c.twoLevel.old;
    if (!b || !n) return `${c.drawing} ${c.kind}: no metrics`;
    return `${c.drawing} ${c.kind}: bendsOutside ${n.bendsOutside} (${b.bendsOutside}), bendsArea ${n.bendsArea90 + n.bendsArea45} (${b.bendsArea90 + b.bendsArea45}), length ${num(n.lengthMm / 1000, 1)} m (${num(b.lengthMm / 1000, 1)}), wallCrossings ${n.wallCrossings} (${b.wallCrossings}), portsLeft ${n.portsLeft} (${b.portsLeft}), chained ${n.chainedRooms} (${b.chainedRooms}), multiEntry ${n.multiEntryRooms} (${b.multiEntryRooms})`;
  });
}
