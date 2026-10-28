import type { Vec2 } from './geometry.js';
import { roomContainsPoint, type Room } from './rooms/room.js';
import type { EntryCandidate } from './route-room-entry.js';
import { BEND_PENALTY_MM } from './route-hanan.js';
import { LEFT_PORT_MM } from './route-feeds.js';
import { roomRunFor, doorAllowed, type RoomRun } from './route-room-runs.js';

export const DOOR_PROBE_MM = 450;     // planner value: the thickest wall measured on the manual fixture is 425 mm
export const DOOR_STEP_MM = 500;      // planner value: grid step of extra door points along a stretch
export const MAX_OWN_DOORS = 120;     // same cap as MAX_ENTRY_CANDIDATES
export const AXIS_EDGE_TOL_MM = 30;   // an edge counts as axis aligned when its smaller coordinate change is at most this

const MIN_EDGE_MM = 100;
const SAMPLE_STEP_MM = 50;
const PROBE_STEP_MM = 25;

/** A part of one axis-aligned edge of the room ring that has a route-area room just outside. */
export interface WallStretch {
  edgeIndex: number;        // index of the ring edge (outer ring, edge i = outer[i] to outer[i+1])
  a: Vec2;                  // start of the edge, mm
  b: Vec2;                  // end of the edge, mm
  outward: Vec2;            // unit axis vector away from the room
  loMm: number;             // start of the raw stretch, mm from a along the edge
  hiMm: number;             // end of the raw stretch, mm from a along the edge
  thicknessMm: number;      // largest distance from the ring to the route-area room along the stretch (the wall thickness)
}

export interface RoomDoorInput {
  room: Pick<Room, 'id' | 'polygon'>;
  mmPerPt: number;
  corridorAt: (pointMm: Vec2) => boolean;       // true in a route-area room
  otherRoomAt?: (pointMm: Vec2) => boolean;     // true in any other room that is not a route-area room; a probe ray that meets one first does not count
  portsMm: readonly Vec2[];                     // the terminals of the room
  blockers: readonly (readonly Vec2[])[];       // polylines of segments of other networks, mm
  clearanceMm: number;                          // caller default 150
  doorMarginMm: number;                         // caller default 200
  probeMm?: number;                             // default DOOR_PROBE_MM
  stepMm?: number;                              // default DOOR_STEP_MM
}

export interface OwnDoor {
  door: EntryCandidate;     // pointMm ON the room ring; source 'port-line' for a point from the terminals, else 'ring'
  fraction: number;         // place of the door in the raw stretch, 0 at loMm and 1 at hiMm (a stretch of length 0 gives 0.5)
  edgeIndex: number;
}

export interface RoomDoorRunsInput extends RoomDoorInput {
  ports: readonly { id: string; point: Vec2 }[];  // portsMm is taken from these points; the caller still passes portsMm = ports points
  bendMm?: number;                                // default BEND_PENALTY_MM from './route-hanan.js'
  stubMm?: number;                                // given to roomRunFor
}

export interface RoomDoorRun {
  door: EntryCandidate;     // the door of the run (run.door); may be moved along the wall by at most ALIGN_MM from the candidate
  fraction: number;
  edgeIndex: number;
  run: RoomRun;
  costMm: number;
}

const axisOf = (nx: number, ny: number): Vec2 => (Math.abs(nx) >= Math.abs(ny) ? { x: Math.sign(nx), y: 0 } : { x: 0, y: Math.sign(ny) });

function thinEvenly<T>(list: readonly T[], keep: number): T[] {
  if (keep <= 0) return [];
  if (list.length <= keep) return [...list];
  return Array.from({ length: keep }, (_, i) => list[Math.floor((i * list.length) / keep)]!);
}

const sourceRank = (source: EntryCandidate['source']): number => (source === 'port-line' ? 0 : 1);

function hitDistance(p: Vec2, outward: Vec2, input: Pick<RoomDoorInput, 'corridorAt' | 'otherRoomAt'>, probeMm: number): number | null {
  for (let d = PROBE_STEP_MM; d <= probeMm; d += PROBE_STEP_MM) {
    const q = { x: p.x + outward.x * d, y: p.y + outward.y * d };
    if (input.otherRoomAt?.(q)) return null;
    if (input.corridorAt(q)) return d;
  }
  return null;
}

export function wallStretches(input: Pick<RoomDoorInput, 'room' | 'mmPerPt' | 'corridorAt' | 'otherRoomAt' | 'probeMm'>): WallStretch[] {
  const { room, mmPerPt } = input;
  const probeMm = input.probeMm ?? DOOR_PROBE_MM;
  const outer = room.polygon.outer;
  const edgeCount = outer.length;
  const out: WallStretch[] = [];
  for (let i = 0; i < edgeCount; i++) {
    const pa = outer[i]!;
    const pb = outer[(i + 1) % edgeCount]!;
    const a = { x: pa.x * mmPerPt, y: pa.y * mmPerPt };
    const b = { x: pb.x * mmPerPt, y: pb.y * mmPerPt };
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < MIN_EDGE_MM || Math.min(Math.abs(dx), Math.abs(dy)) > AXIS_EDGE_TOL_MM) continue;
    const e = { x: dx / len, y: dy / len };
    const nx = -e.y;
    const ny = e.x;
    const middle = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const sign = roomContainsPoint(room, { x: middle.x + nx / mmPerPt, y: middle.y + ny / mmPerPt }) ? -1 : 1;
    const outward = axisOf(sign * nx, sign * ny);
    const count = Math.max(1, Math.floor(len / SAMPLE_STEP_MM));
    let run: { loMm: number; hiMm: number; thicknessMm: number } | null = null;
    const flush = (): void => {
      if (run) out.push({ edgeIndex: i, a, b, outward, ...run });
      run = null;
    };
    for (let k = 0; k <= count; k++) {
      const along = (len * k) / count;
      const p = { x: a.x + e.x * along, y: a.y + e.y * along };
      const hit = hitDistance(p, outward, input, probeMm);
      if (hit === null) {
        flush();
        continue;
      }
      if (!run) run = { loMm: along, hiMm: along, thicknessMm: hit };
      else {
        run.hiMm = along;
        run.thicknessMm = Math.max(run.thicknessMm, hit);
      }
    }
    flush();
  }
  return out;
}

const doorOrder = (p: OwnDoor, q: OwnDoor): number =>
  sourceRank(p.door.source) - sourceRank(q.door.source) ||
  p.door.pointMm.x - q.door.pointMm.x ||
  p.door.pointMm.y - q.door.pointMm.y ||
  p.edgeIndex - q.edgeIndex;

export function roomDoorCandidates(input: RoomDoorInput): OwnDoor[] {
  const { room, mmPerPt, blockers, clearanceMm, doorMarginMm, portsMm } = input;
  const stepMm = input.stepMm !== undefined && Number.isFinite(input.stepMm) && input.stepMm > 0 ? input.stepMm : DOOR_STEP_MM;
  const found = new Map<string, OwnDoor>();
  for (const stretch of wallStretches(input)) {
    const { a, b, outward, loMm, hiMm } = stretch;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const e = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const lo = loMm + doorMarginMm;
    const hi = hiMm - doorMarginMm;
    if (lo > hi) continue;
    const proj = (p: Vec2): number => (p.x - a.x) * e.x + (p.y - a.y) * e.y;
    const clamp = (s: number): number => Math.min(hi, Math.max(lo, s));
    const projs = portsMm.map(proj);
    const positions: { s: number; source: EntryCandidate['source'] }[] = [{ s: (lo + hi) / 2, source: 'ring' }];
    for (const s of projs) positions.push({ s: clamp(s), source: 'port-line' });
    for (let i = 0; i < projs.length; i++) {
      for (let j = i + 1; j < projs.length; j++) positions.push({ s: clamp((projs[i]! + projs[j]!) / 2), source: 'port-line' });
    }
    if (projs.length > 0) positions.push({ s: clamp(projs.reduce((sum, s) => sum + s, 0) / projs.length), source: 'port-line' });
    for (let s = lo; s < hi; s += stepMm) positions.push({ s, source: 'ring' });
    positions.push({ s: hi, source: 'ring' });
    for (const { s, source } of positions) {
      const pointMm = { x: a.x + e.x * s, y: a.y + e.y * s };
      const key = `${Math.round(pointMm.x)},${Math.round(pointMm.y)},${outward.x},${outward.y}`;
      const fraction = hiMm === loMm ? 0.5 : (s - loMm) / (hiMm - loMm);
      const existing = found.get(key);
      if (existing && !(source === 'port-line' && existing.door.source !== 'port-line')) continue;
      found.set(key, { door: { pointMm, outward, source }, fraction, edgeIndex: stretch.edgeIndex });
    }
  }
  const allowed = [...found.values()].filter((d) =>
    doorAllowed({ room, mmPerPt, door: d.door, blockers, clearanceMm, doorMarginMm }),
  );
  const sorted = allowed.sort(doorOrder);
  if (sorted.length <= MAX_OWN_DOORS) return sorted;
  const fixed = sorted.filter((d) => d.door.source === 'port-line').slice(0, MAX_OWN_DOORS);
  const ring = sorted.filter((d) => d.door.source !== 'port-line');
  return [...fixed, ...thinEvenly(ring, MAX_OWN_DOORS - fixed.length)].sort(doorOrder);
}

export function roomDoorRuns(input: RoomDoorRunsInput): RoomDoorRun[] {
  const ports = [...input.ports].sort(
    (p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0) || p.point.x - q.point.x || p.point.y - q.point.y,
  );
  const bendMm = input.bendMm ?? BEND_PENALTY_MM;
  const candidates = roomDoorCandidates({ ...input, portsMm: ports.map((p) => p.point) });
  const out: { candidate: EntryCandidate; entry: RoomDoorRun }[] = [];
  for (const { door, fraction, edgeIndex } of candidates) {
    const [run] = roomRunFor({
      room: input.room,
      mmPerPt: input.mmPerPt,
      door,
      ports,
      blockers: input.blockers,
      clearanceMm: input.clearanceMm,
      doorMarginMm: input.doorMarginMm,
      stubMm: input.stubMm,
    });
    if (!run) continue;
    const costMm = run.lengthMm + run.bends * bendMm + run.leftPortIds.length * LEFT_PORT_MM;
    out.push({ candidate: door, entry: { door: run.door, fraction, edgeIndex, run, costMm } });
  }
  return out
    .sort(
      (p, q) =>
        p.entry.costMm - q.entry.costMm ||
        p.entry.run.bends - q.entry.run.bends ||
        sourceRank(p.candidate.source) - sourceRank(q.candidate.source) ||
        p.candidate.pointMm.x - q.candidate.pointMm.x ||
        p.candidate.pointMm.y - q.candidate.pointMm.y,
    )
    .map(({ entry }) => entry);
}
