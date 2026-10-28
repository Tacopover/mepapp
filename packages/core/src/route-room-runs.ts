import type { Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';
import type { EntryCandidate } from './route-room-entry.js';
import { dist, distanceToPath } from './route-feed-helpers.js';
import { elbowPath, insideRouteArea, ROUTE_SAMPLE_STEP_MM } from './route-layout.js';
import { runsOverOtherPort } from './route-topology.js';

export interface RoomRun {
  roomId: string;
  door: EntryCandidate;          // the door used (pointMm may be shifted along the wall by at most ALIGN_MM for 'single', see below)
  stem: Vec2[];                  // comb: [door point, stem end]; else []
  teeth: Vec2[][];               // comb: one 2-point piece [tee on the stem, terminal] for each terminal (also the stub); else []
  lead: Vec2[];                  // single: path from the door point to the terminal (2 or 3 points); else []
  bends: number;                 // bends of the whole run (comb: 0)
  lengthMm: number;              // sum of the lengths of stem, teeth and lead
  leftPortIds: string[];         // sorted; fallback: all port ids; else []
  pattern: 'single' | 'comb' | 'blocks' | 'l' | 'fallback';
}

export interface RoomRunInput {
  room: Pick<Room, 'id' | 'polygon'>;
  mmPerPt: number;
  door: EntryCandidate;                          // pointMm on the wall (mm), outward = unit axis vector away from the room
  ports: readonly { id: string; point: Vec2 }[]; // the terminals of the room, mm
  blockers: readonly (readonly Vec2[])[];        // polylines of segments of other networks, mm
  clearanceMm: number;                           // caller default 150
  doorMarginMm: number;                          // caller default 200
  stubMm?: number;                               // default ROOM_STUB_MM
}

export const ROOM_STUB_MM = 150;     // planner value, not verified
export const ALIGN_MM = 50;          // single: a door this close to the terminal line is moved onto it (planner value)
export const ON_STEM_MM = 2;         // comb: a terminal this close to the stem line is "on the stem"

const BLOCKER_STEP_MM = 50;
const MIN_STUB_MM = 50;

interface Frame { inw: Vec2; perp: Vec2 }

interface Candidate { door: EntryCandidate; lead: Vec2[]; bends: number; lengthMm: number }

const sub = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x - q.x, y: p.y - q.y });
const add = (p: Vec2, q: Vec2): Vec2 => ({ x: p.x + q.x, y: p.y + q.y });
const scaled = (v: Vec2, k: number): Vec2 => ({ x: v.x * k, y: v.y * k });
const dot = (p: Vec2, q: Vec2): number => p.x * q.x + p.y * q.y;

function frameOf(outward: Vec2): Frame {
  return { inw: { x: -outward.x, y: -outward.y }, perp: { x: -outward.y, y: outward.x } };
}

function lengthOf(path: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 1; i < path.length; i++) sum += dist(path[i - 1]!, path[i]!);
  return sum;
}

/** Points along the path, stepMm apart at most. Both ends are included. */
function samplesOf(path: readonly Vec2[], stepMm: number): Vec2[] {
  const out: Vec2[] = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / stepMm));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

function pieceOk(path: readonly Vec2[], input: RoomRunInput, portPoints: readonly Vec2[]): boolean {
  const inside = insideRouteArea([input.room], input.mmPerPt);
  if (!samplesOf(path, ROUTE_SAMPLE_STEP_MM).every((p) => inside(p))) return false;
  const clear = samplesOf(path, BLOCKER_STEP_MM).every((p) =>
    input.blockers.every((blocker) => distanceToPath(p, blocker) >= input.clearanceMm),
  );
  return clear && !runsOverOtherPort(path, portPoints);
}

export function doorAllowed(input: Pick<RoomRunInput, 'room' | 'mmPerPt' | 'door' | 'blockers' | 'clearanceMm' | 'doorMarginMm'>): boolean {
  const { room, mmPerPt, door } = input;
  for (const ring of [room.polygon.outer, ...room.polygon.holes]) {
    for (const v of ring) {
      if (dist(door.pointMm, { x: v.x * mmPerPt, y: v.y * mmPerPt }) < input.doorMarginMm) return false;
    }
  }
  return input.blockers.every((blocker) => distanceToPath(door.pointMm, blocker) >= input.clearanceMm);
}

function candidateOf(input: RoomRunInput, door: EntryCandidate, lead: Vec2[], portPoints: readonly Vec2[]): Candidate | null {
  if (!pieceOk(lead, input, portPoints) || !doorAllowed({ ...input, door })) return null;
  return { door, lead, bends: lead.length - 2, lengthMm: lengthOf(lead) };
}

function singleRun(input: RoomRunInput, port: { id: string; point: Vec2 }, portPoints: readonly Vec2[]): RoomRun | null {
  const { inw, perp } = frameOf(input.door.outward);
  const doorPt = input.door.pointMm;
  const t = port.point;
  const depth = dot(sub(t, doorPt), inw);
  if (depth <= 0) return null;
  const lateral = dot(sub(t, doorPt), perp);
  const aligned: EntryCandidate = { ...input.door, pointMm: sub(t, scaled(inw, depth)) };
  const inwAxis: 'x' | 'y' = inw.x !== 0 ? 'x' : 'y';
  const lateralAxis: 'x' | 'y' = inwAxis === 'x' ? 'y' : 'x';
  const options: (Candidate | null)[] = [
    Math.abs(lateral) <= ALIGN_MM ? candidateOf(input, aligned, [aligned.pointMm, t], portPoints) : null,
    candidateOf(input, input.door, elbowPath(doorPt, t, inwAxis), portPoints),
    candidateOf(input, input.door, elbowPath(doorPt, t, lateralAxis), portPoints),
  ];
  let best: Candidate | null = null;
  for (const c of options) {
    if (c && (!best || c.bends < best.bends || (c.bends === best.bends && c.lengthMm < best.lengthMm))) best = c;
  }
  if (!best) return null;
  return {
    roomId: input.room.id,
    door: best.door,
    stem: [],
    teeth: [],
    lead: best.lead,
    bends: best.bends,
    lengthMm: best.lengthMm,
    leftPortIds: [],
    pattern: 'single',
  };
}

function combRun(input: RoomRunInput, ports: readonly { id: string; point: Vec2 }[], portPoints: readonly Vec2[]): RoomRun | null {
  const { inw, perp } = frameOf(input.door.outward);
  const doorPt = input.door.pointMm;
  const stubMm = input.stubMm ?? ROOM_STUB_MM;
  const terms = ports.map((port, order) => {
    const depth = dot(sub(port.point, doorPt), inw);
    const lateral = dot(sub(port.point, doorPt), perp);
    const onStem = Math.abs(lateral) <= ON_STEM_MM;
    return { point: port.point, order, depth, lateral, onStem, teeDepth: onStem ? depth - stubMm : depth };
  });
  if (terms.filter((t) => t.onStem).length > 1) return null;
  if (terms.some((t) => t.teeDepth <= 0)) return null;
  const stemEnd = Math.max(...terms.map((t) => t.teeDepth));
  if (terms.some((t) => t.onStem && (stubMm < MIN_STUB_MM || stemEnd > t.teeDepth))) return null;
  const stem = [doorPt, add(doorPt, scaled(inw, stemEnd))];
  if (!pieceOk(stem, input, portPoints)) return null;
  const sorted = [...terms].sort((p, q) => p.depth - q.depth || p.lateral - q.lateral || p.order - q.order);
  const teeth = sorted.map((t) => [add(doorPt, scaled(inw, t.teeDepth)), t.point]);
  if (!teeth.every((tooth) => pieceOk(tooth, input, portPoints))) return null;
  return {
    roomId: input.room.id,
    door: input.door,
    stem,
    teeth,
    lead: [],
    bends: 0,
    lengthMm: lengthOf(stem) + teeth.reduce((sum, tooth) => sum + lengthOf(tooth), 0),
    leftPortIds: [],
    pattern: 'comb',
  };
}

function fallbackRun(input: RoomRunInput, ports: readonly { id: string }[]): RoomRun {
  return {
    roomId: input.room.id,
    door: input.door,
    stem: [],
    teeth: [],
    lead: [],
    bends: 0,
    lengthMm: 0,
    leftPortIds: ports.map((p) => p.id),
    pattern: 'fallback',
  };
}

export function roomRunFor(input: RoomRunInput): RoomRun[] {
  if (input.ports.length === 0 || !doorAllowed(input)) return [];
  const ports = [...input.ports].sort(
    (p, q) => (p.id < q.id ? -1 : p.id > q.id ? 1 : 0) || p.point.x - q.point.x || p.point.y - q.point.y,
  );
  const portPoints = ports.map((p) => p.point);
  const run = ports.length === 1 ? singleRun(input, ports[0]!, portPoints) : combRun(input, ports, portPoints);
  return [run ?? fallbackRun(input, ports)];
}
