import { closestPointOnSegment, distance, type Vec2 } from './geometry.js';
import { exactRoomSpine } from './route-exact.js';
import type { EntryCandidate } from './route-room-entry.js';
import { roomSpine, type SpineInput } from './route-hanan.js';

export const ENTRY_DEPTH_MM = 200;   // planner value, not verified
export const SPINE_WALL_MARGIN_MM = 5;
export const SPINE_INSET_MM = 100;
export const SPINE_MIN_GAP_MM = 100;
const STUB_STEP_MM = 50;
const STUB_MAX_MM = 1500;
const DEPTH_EPS_MM = 1e-6;

type Segment = readonly [Vec2, Vec2];

function ringSegments(ring: readonly Vec2[]): Segment[] {
  return ring.map((a, i) => [a, ring[(i + 1) % ring.length]!] as const);
}

export function ringDistanceMm(ring: readonly Vec2[], p: Vec2): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    best = Math.min(best, distance(p, closestPointOnSegment(p, a, b).point));
  }
  return best;
}

export interface RoomFeedInput {
  entry: EntryCandidate;                                   // point on the wall (mm), outward unit vector
  ports: readonly { id: string; point: Vec2 }[];           // terminals of the room, mm
  ringMm: readonly Vec2[];                                 // outer ring of the room, mm: its x and y values become grid lines
  inside: (p: Vec2) => boolean;                            // region test of the room, mm
  roomContains: (p: Vec2) => boolean;                      // strict polygon test, mm
  crossesExisting: (a: Vec2, b: Vec2) => number;
  bendMm?: number; crossingMm?: number; stepMm?: number;
  exactMaxPorts?: number;                                  // exactRoomSpine when ports.length <= this, else roomSpine
  middleLines?: boolean;                                   // default false: add the middle grid lines between the terminal lines
}

export interface RoomFeed { stub: Vec2[]; junctionMm: Vec2; spine: Vec2[][]; leftPortIds: string[]; lengthMm: number; bends: number }

export function feedBends(stub: readonly Vec2[], junctionMm: Vec2, dir: Vec2, spinePaths: readonly (readonly Vec2[])[]): number {
  let bends = 0;
  const leaving: Vec2[][] = [];
  for (const path of spinePaths) {
    bends += Math.max(0, path.length - 2);
    if (path.length >= 2 && path[0]!.x === junctionMm.x && path[0]!.y === junctionMm.y) leaving.push([...path]);
  }
  if (stub.length === 2 && leaving.length === 1) {
    const leg = leaving[0]![1]!;
    const cross = dir.x * (leg.y - junctionMm.y) - dir.y * (leg.x - junctionMm.x);
    if (cross !== 0) bends += 1;
  }
  return bends;
}

function middleGridLines(values: readonly number[]): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const mids: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    if (b - a > 2 * SPINE_MIN_GAP_MM) mids.push((a + b) / 2);
  }
  return mids;
}

export function roomFeed(input: RoomFeedInput): RoomFeed {
  const { entry, ports, ringMm, inside, roomContains, crossesExisting, bendMm, crossingMm, stepMm, exactMaxPorts } = input;
  const dir: Vec2 = { x: -entry.outward.x, y: -entry.outward.y };
  const at = (d: number): Vec2 => ({ x: entry.pointMm.x + dir.x * d, y: entry.pointMm.y + dir.y * d });
  const depthOf = (p: Vec2): number => (p.x - entry.pointMm.x) * dir.x + (p.y - entry.pointMm.y) * dir.y;

  let firstInside = -1;
  for (let d = STUB_STEP_MM; d <= STUB_MAX_MM; d += STUB_STEP_MM) {
    if (roomContains(at(d))) {
      firstInside = d;
      break;
    }
  }

  let stubLengthMm = 0;
  let junctionMm = entry.pointMm;
  let depthRule = false;
  if (firstInside >= 0) {
    let d = firstInside + ENTRY_DEPTH_MM;
    while (d >= firstInside && !(inside(at(d)) && roomContains(at(d)))) d -= STUB_STEP_MM;
    if (d >= firstInside) {
      stubLengthMm = d;
      junctionMm = at(d);
      depthRule = true;
    }
  }
  const stub = stubLengthMm > 0 ? [entry.pointMm, junctionMm] : [entry.pointMm];

  const closePorts = ports.filter((q) => depthOf(q.point) < ENTRY_DEPTH_MM - DEPTH_EPS_MM);
  const ringGeom = ringSegments(ringMm).map(([a, b]) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return { ax: a.x, ay: a.y, dx, dy, len2: dx * dx + dy * dy };
  });
  const nearRing = (p: Vec2): boolean => {
    for (const g of ringGeom) {
      const t = g.len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - g.ax) * g.dx + (p.y - g.ay) * g.dy) / g.len2));
      if (Math.hypot(p.x - (g.ax + g.dx * t), p.y - (g.ay + g.dy * t)) < SPINE_WALL_MARGIN_MM) return true;
    }
    return false;
  };
  const isTerminal = (p: Vec2): boolean => ports.some((q) => q.point.x === p.x && q.point.y === p.y);
  const isRoot = (p: Vec2): boolean => junctionMm.x === p.x && junctionMm.y === p.y;
  const offWall = (p: Vec2): boolean => !nearRing(p);
  const depthOk = (p: Vec2): boolean =>
    depthOf(p) >= ENTRY_DEPTH_MM - DEPTH_EPS_MM || closePorts.some((q) => q.point.x === p.x && q.point.y === p.y);
  const spineInside = (p: Vec2): boolean =>
    inside(p) &&
    (!depthRule || depthOk(p)) &&
    (!depthRule || isTerminal(p) || isRoot(p) || offWall(p));

  const gridOffsetsMm = depthRule ? [0, SPINE_INSET_MM, -SPINE_INSET_MM] : [0];
  const useMiddle = depthRule && input.middleLines === true;
  const middleXs = useMiddle ? middleGridLines([junctionMm.x, ...ports.map((q) => q.point.x)]) : [];
  const middleYs = useMiddle ? middleGridLines([junctionMm.y, ...ports.map((q) => q.point.y)]) : [];
  const spineInput: SpineInput = {
    root: junctionMm,
    entryDir: dir,
    ports,
    inside: spineInside,
    crossesExisting,
    ...(stepMm !== undefined ? { stepMm } : {}),
    ...(bendMm !== undefined ? { bendPenaltyMm: bendMm } : {}),
    ...(crossingMm !== undefined ? { crossingPenaltyMm: crossingMm } : {}),
    gridXs: [...ringMm.flatMap((p) => gridOffsetsMm.map((o) => p.x + o)), ...middleXs],
    gridYs: [...ringMm.flatMap((p) => gridOffsetsMm.map((o) => p.y + o)), ...middleYs],
  };
  const spine = exactMaxPorts !== undefined && ports.length <= exactMaxPorts
    ? exactRoomSpine(spineInput, bendMm)
    : roomSpine(spineInput);

  return {
    stub, junctionMm, spine: spine.paths, leftPortIds: spine.unreachedPortIds, lengthMm: stubLengthMm + spine.lengthMm,
    bends: feedBends(stub, junctionMm, dir, spine.paths),
  };
}
