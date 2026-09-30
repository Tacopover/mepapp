// The Room domain model: what a saved room is, and pure helpers on it. Room
// detection (fill.ts, detect-all.ts) produces polygons; this module turns them
// into rooms the user can name, correct and save. No rendering, no I/O. The undo
// commands live in @mepapp/render (roomCommands.ts), like the other drawing state.

import { pointInRing } from './polygon.js';
import type { Calibration } from '../calibration.js';
import type { Vec2 } from '../geometry.js';
import type { RoomFillResult, RoomPolygon } from './types.js';

/** How a room came to exist. */
export type RoomSource = 'detected' | 'click' | 'manual';

export interface Room {
  id: string;
  pageIndex: number;
  /** Outer ring and hole rings in displayed page space (points, origin top-left, y down), the space of calibration.ts. */
  polygon: RoomPolygon;
  name: string | null;
  number: string | null;
  source: RoomSource;
  /** The user changed the polygon, name or number. Detect-all keeps a locked room and replaces the others. */
  locked: boolean;
  /** Detection found no closed wall around this room: the polygon may be wrong. */
  open: boolean;
  /** Area printed in the drawing, m2. Set when a label is read from the PDF text; used to warn about a large difference. */
  labelAreaM2?: number;
}

export type RoomInput = Omit<Room, 'id'>;

export const roomId = (seq: number): string => `room-${seq}`;

const flat = (ring: readonly Vec2[]): number[] => ring.flatMap((p) => [p.x, p.y]);

function ringAreaPt2(ring: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** Area of the polygon in square page points, holes subtracted. */
export function polygonAreaPt2(polygon: RoomPolygon): number {
  return ringAreaPt2(polygon.outer) - polygon.holes.reduce((sum, h) => sum + ringAreaPt2(h), 0);
}

/** Room area in m2. The calibration converts page points to millimetres (pageUnitsPerRealUnit is points per mm). */
export function roomAreaM2(room: Pick<Room, 'polygon'>, calibration: Calibration): number {
  const mmPerPt = 1 / calibration.pageUnitsPerRealUnit;
  return (polygonAreaPt2(room.polygon) * mmPerPt * mmPerPt) / 1e6;
}

/** True when the point is inside the outer ring and outside every hole. */
export function polygonContainsPoint(polygon: RoomPolygon, p: Vec2): boolean {
  if (polygon.outer.length < 3 || !pointInRing(p.x, p.y, flat(polygon.outer))) return false;
  return !polygon.holes.some((h) => h.length >= 3 && pointInRing(p.x, p.y, flat(h)));
}

export const roomContainsPoint = (room: Pick<Room, 'polygon'>, p: Vec2): boolean => polygonContainsPoint(room.polygon, p);

export function roomBounds(room: Pick<Room, 'polygon'>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of room.polygon.outer) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * A point inside the room for a label or an assignment test: the centroid of
 * the outer ring when it lies inside the polygon, else the grid point inside
 * the polygon that is farthest from the outer ring's vertices.
 */
export function roomLabelPoint(room: Pick<Room, 'polygon'>): Vec2 {
  const outer = room.polygon.outer;
  if (outer.length === 0) return { x: 0, y: 0 };
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < outer.length; i++) {
    const p = outer[i]!;
    const q = outer[(i + 1) % outer.length]!;
    const w = p.x * q.y - q.x * p.y;
    a += w;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  if (Math.abs(a) > 1e-9) {
    const c = { x: cx / (3 * a), y: cy / (3 * a) };
    if (polygonContainsPoint(room.polygon, c)) return c;
  }
  const b = roomBounds(room);
  const N = 24;
  let best: Vec2 | null = null;
  let bestD = -1;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const p = { x: b.minX + ((b.maxX - b.minX) * i) / N, y: b.minY + ((b.maxY - b.minY) * j) / N };
      if (!polygonContainsPoint(room.polygon, p)) continue;
      const d = Math.min(...outer.map((v) => Math.hypot(v.x - p.x, v.y - p.y)));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best ?? outer[0]!;
}

/** Rooms on the page that contain the point, smallest polygon first (an inner room wins over one that surrounds it). */
export function roomsAtPoint(rooms: readonly Room[], p: Vec2, pageIndex: number): Room[] {
  return rooms
    .filter((r) => r.pageIndex === pageIndex && roomContainsPoint(r, p))
    .sort((x, y) => polygonAreaPt2(x.polygon) - polygonAreaPt2(y.polygon));
}

/** A room from a click-to-fill result or one detect-all room. */
export function roomFromFill(fill: RoomFillResult, pageIndex: number, source: 'detected' | 'click'): RoomInput {
  return {
    pageIndex,
    polygon: { outer: fill.polygon.outer.map((p) => ({ ...p })), holes: fill.polygon.holes.map((h) => h.map((p) => ({ ...p }))) },
    name: null,
    number: null,
    source,
    locked: false,
    open: fill.flags.open,
  };
}

/** A room the user drew by hand. It is locked from the start. */
export function manualRoom(pageIndex: number, outer: readonly Vec2[]): RoomInput {
  return { pageIndex, polygon: { outer: outer.map((p) => ({ ...p })), holes: [] }, name: null, number: null, source: 'manual', locked: true, open: false };
}

export type RoomPatch = Partial<Pick<Room, 'polygon' | 'name' | 'number' | 'open' | 'labelAreaM2'>>;

/** Applies a change to a room. A change of polygon, name or number locks the room. */
export function updateRoom(room: Room, patch: RoomPatch): Room {
  const userEdit = patch.polygon !== undefined || patch.name !== undefined || patch.number !== undefined;
  return { ...room, ...patch, locked: room.locked || userEdit };
}

export function translateRoom(room: Room, dx: number, dy: number): Room {
  const move = (ring: readonly Vec2[]): Vec2[] => ring.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  return { ...room, polygon: { outer: move(room.polygon.outer), holes: room.polygon.holes.map(move) }, locked: true };
}

export interface RoomMergePlan {
  remove: string[]; // ids of existing rooms to delete
  add: Room[]; // new rooms, with ids from newId
}

/**
 * Plans the result of running detect-all again on a page. Rooms the user made
 * or touched (locked, or not from detection) stay. Other detected rooms on the
 * page are replaced. A new detected room whose label point lies inside a kept
 * room is dropped, so a corrected room is not duplicated. Rooms on other pages
 * are never touched.
 */
export function mergeDetectedRooms(existing: readonly Room[], detected: readonly RoomInput[], pageIndex: number, newId: () => string): RoomMergePlan {
  const onPage = existing.filter((r) => r.pageIndex === pageIndex);
  const kept = onPage.filter((r) => r.locked || r.source !== 'detected');
  const remove = onPage.filter((r) => !kept.includes(r)).map((r) => r.id);
  const add: Room[] = [];
  for (const d of detected) {
    if (d.pageIndex !== pageIndex) continue;
    const probe = roomLabelPoint(d);
    if (kept.some((k) => roomContainsPoint(k, probe))) continue;
    add.push({ ...d, id: newId() });
  }
  return { remove, add };
}
