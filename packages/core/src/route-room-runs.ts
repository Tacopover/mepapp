import type { Vec2 } from './geometry.js';
import type { Room } from './rooms/room.js';
import type { EntryCandidate } from './route-room-entry.js';
import type { RoomFeed } from './route-room-feed.js';
import { BEND_PENALTY_MM } from './route-hanan.js';
import { dist, distanceToPath } from './route-feed-helpers.js';
import { elbowPath, insideRouteArea, ROUTE_SAMPLE_STEP_MM } from './route-layout.js';
import { runsOverOtherPort } from './route-topology.js';

export interface RoomRun {
  roomId: string;
  door: EntryCandidate;          // the door used (pointMm may be shifted along the wall by at most ALIGN_MM for 'single', see below)
  stem: Vec2[];                  // comb: [door point, stem end]; l: [corner, stem end]; else []
  teeth: Vec2[][];               // comb and l: one 2-point piece [tee on the stem, terminal] for each terminal (also the stub); fallback with roomFeedFallback: the feed spine; else []
  lead: Vec2[];                  // single: path from the door point to the terminal (2 or 3 points); l: [door point, corner]; fallback with roomFeedFallback: the feed stub; else []
  bends: number;                 // bends of the whole run (comb: 0; l: 1; fallback with roomFeedFallback: the feed bends)
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
  bendMm?: number;                                       // default BEND_PENALTY_MM, price of a bend when patterns compete
  wallParallelToRows?: boolean;                          // false: do not try the L. undefined or true: try it
  splitFromTerminals?: number;                           // default Infinity; read only by splitIntoBlocks callers, roomRunFor ignores it
  roomFeedFallback?: (door: EntryCandidate) => RoomFeed; // called when no pattern reaches all terminals
}

export const ROOM_STUB_MM = 150;     // planner value, not verified
export const ALIGN_MM = 50;          // single: a door this close to the terminal line is moved onto it (planner value)
export const ON_STEM_MM = 2;         // comb: a terminal this close to the stem line is "on the stem"
export const ROW_TOL_MM = 300;       // planner value: terminals of one row differ by at most 9 mm on the manual fixture, rows are 1200 mm or more apart

const BLOCKER_STEP_MM = 50;
const MIN_STUB_MM = 50;
const L_OFFSET_MM = 500;             // l: the corner lies this far inward of the nearest terminal (planner value, not verified)

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

function lRun(input: RoomRunInput, ports: readonly { id: string; point: Vec2 }[], portPoints: readonly Vec2[]): RoomRun | null {
  const { inw, perp } = frameOf(input.door.outward);
  const doorPt = input.door.pointMm;
  const terms = ports.map((port, order) => ({
    point: port.point,
    order,
    depth: dot(sub(port.point, doorPt), inw),
    lateral: dot(sub(port.point, doorPt), perp),
  }));
  const s = Math.min(...terms.map((t) => t.depth)) - L_OFFSET_MM;
  if (s < input.doorMarginMm) return null;
  const side = Math.sign(terms[0]!.lateral);
  if (terms.some((t) => Math.abs(t.lateral) < MIN_STUB_MM || t.lateral * side < 0)) return null;
  if (terms.some((t) => Math.abs(t.depth - s) <= ON_STEM_MM)) return null;
  const corner = add(doorPt, scaled(inw, s));
  const farthest = Math.max(...terms.map((t) => Math.abs(t.lateral)));
  const lead = [doorPt, corner];
  const stem = [corner, add(corner, scaled(perp, side * farthest))];
  const sorted = [...terms].sort((p, q) => p.lateral - q.lateral || p.depth - q.depth || p.order - q.order);
  const teeth = sorted.map((t) => [add(corner, scaled(perp, t.lateral)), t.point]);
  if (![lead, stem, ...teeth].every((piece) => pieceOk(piece, input, portPoints))) return null;
  return {
    roomId: input.room.id,
    door: input.door,
    stem,
    teeth,
    lead,
    bends: 1,
    lengthMm: lengthOf(lead) + lengthOf(stem) + teeth.reduce((sum, tooth) => sum + lengthOf(tooth), 0),
    leftPortIds: [],
    pattern: 'l',
  };
}

function bestPatternRun(input: RoomRunInput, ports: readonly { id: string; point: Vec2 }[], portPoints: readonly Vec2[]): RoomRun | null {
  const bendMm = input.bendMm ?? BEND_PENALTY_MM;
  const options = [combRun(input, ports, portPoints), input.wallParallelToRows === false ? null : lRun(input, ports, portPoints)];
  const costOf = (run: RoomRun): number => run.lengthMm + run.bends * bendMm;
  let best: RoomRun | null = null;
  for (const run of options) {
    if (run && (!best || costOf(run) < costOf(best) || (costOf(run) === costOf(best) && run.bends < best.bends))) best = run;
  }
  return best;
}

function feedRun(input: RoomRunInput, feed: RoomFeed): RoomRun {
  return {
    roomId: input.room.id,
    door: input.door,
    stem: [],
    teeth: feed.spine,
    lead: feed.stub,
    bends: feed.bends,
    lengthMm: feed.lengthMm,
    leftPortIds: [...feed.leftPortIds].sort(),
    pattern: 'fallback',
  };
}

function clusterBy<T>(items: readonly T[], value: (item: T) => number, tolMm: number): T[][] {
  const sorted = [...items].sort((p, q) => value(p) - value(q));
  const groups: T[][] = [];
  let previous = -Infinity;
  for (const item of sorted) {
    const v = value(item);
    if (groups.length === 0 || v - previous > tolMm) groups.push([]);
    groups[groups.length - 1]!.push(item);
    previous = v;
  }
  return groups;
}

/** Terminals grouped for blocks, or one group. Blocks apply only when ports.length >= splitFromTerminals AND some group of terminals with the same depth (tolerance rowTolMm, depth = dot(point, inw) for the given outward) has 3 or more terminals (a column along the wall). Then cluster the terminals by lateral coordinate (dot(point, perp), tolerance rowTolMm) into lateral rows, sort the rows ascending, and chunk the rows by 2: each chunk is a block (all terminals of its rows). A last chunk may hold 1 row. Otherwise return [all ports]. Inside a block sort by lateral, depth, id. Pure, deterministic. */
export function splitIntoBlocks<T extends { id: string; point: Vec2 }>(
  ports: readonly T[],
  outward: Vec2,
  splitFromTerminals: number,
  rowTolMm: number = ROW_TOL_MM,
): T[][] {
  const { inw, perp } = frameOf(outward);
  const depthOf = (p: T): number => dot(p.point, inw);
  const lateralOf = (p: T): number => dot(p.point, perp);
  const inBlock = (p: T, q: T): number =>
    lateralOf(p) - lateralOf(q) || depthOf(p) - depthOf(q) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
  const column =
    ports.length >= splitFromTerminals && clusterBy(ports, depthOf, rowTolMm).some((group) => group.length >= 3);
  if (!column) return [[...ports].sort(inBlock)];
  const rows = clusterBy(ports, lateralOf, rowTolMm);
  const blocks: T[][] = [];
  for (let i = 0; i < rows.length; i += 2) blocks.push(rows.slice(i, i + 2).flat().sort(inBlock));
  return blocks;
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
  const run = ports.length === 1 ? singleRun(input, ports[0]!, portPoints) : bestPatternRun(input, ports, portPoints);
  if (run) return [run];
  if (input.roomFeedFallback) return [feedRun(input, input.roomFeedFallback(input.door))];
  return [fallbackRun(input, ports)];
}
