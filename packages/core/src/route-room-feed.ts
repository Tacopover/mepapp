import { closestPointOnSegment, distance, type Vec2 } from './geometry.js';
import { exactRoomSpine } from './route-exact.js';
import type { EntryCandidate } from './route-room-entry.js';
import { roomSpine, type SpineInput } from './route-hanan.js';

export const ENTRY_DEPTH_MM = 200;   // planner value, not verified
export const SPINE_WALL_MARGIN_MM = 5;
export const SPINE_INSET_MM = 100;
const STUB_STEP_MM = 50;
const STUB_MAX_MM = 1500;
const DEPTH_EPS_MM = 1e-6;

function ringDistanceMm(ring: readonly Vec2[], p: Vec2): number {
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
}

export interface RoomFeed { stub: Vec2[]; junctionMm: Vec2; spine: Vec2[][]; leftPortIds: string[]; lengthMm: number }

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
  const spineInside = (p: Vec2): boolean =>
    inside(p) &&
    (!depthRule || depthOf(p) >= ENTRY_DEPTH_MM - DEPTH_EPS_MM || closePorts.some((q) => q.point.x === p.x && q.point.y === p.y)) &&
    (!depthRule || ports.some((q) => q.point.x === p.x && q.point.y === p.y) || (junctionMm.x === p.x && junctionMm.y === p.y) || ringDistanceMm(ringMm, p) >= SPINE_WALL_MARGIN_MM);

  const gridOffsetsMm = depthRule ? [0, SPINE_INSET_MM, -SPINE_INSET_MM] : [0];
  const spineInput: SpineInput = {
    root: junctionMm,
    entryDir: dir,
    ports,
    inside: spineInside,
    crossesExisting,
    ...(stepMm !== undefined ? { stepMm } : {}),
    ...(bendMm !== undefined ? { bendPenaltyMm: bendMm } : {}),
    ...(crossingMm !== undefined ? { crossingPenaltyMm: crossingMm } : {}),
    gridXs: ringMm.flatMap((p) => gridOffsetsMm.map((o) => p.x + o)),
    gridYs: ringMm.flatMap((p) => gridOffsetsMm.map((o) => p.y + o)),
  };
  const spine = exactMaxPorts !== undefined && ports.length <= exactMaxPorts
    ? exactRoomSpine(spineInput, bendMm)
    : roomSpine(spineInput);

  return { stub, junctionMm, spine: spine.paths, leftPortIds: spine.unreachedPortIds, lengthMm: stubLengthMm + spine.lengthMm };
}
