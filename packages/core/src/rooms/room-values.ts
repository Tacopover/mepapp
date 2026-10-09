// Room values for per-room calculations (room-auto-placement.md Phase 2): perimeter, the
// minimum bounding rectangle (length, width, main axis), the ceiling height chain, volume and
// number of people. Pure functions on a Room; the calibration converts page points to mm.

import type { Calibration } from '../calibration.js';
import type { Vec2 } from '../geometry.js';
import { roomAreaM2, type Room } from './room.js';
import type { RoomType } from './room-type.js';

/** The ceiling height when no other level gives one, mm. */
export const DEFAULT_CEILING_HEIGHT_MM = 2700;

/** Where a ceiling height comes from: the user setting, the drawing (PDF), the room type in this drawing, or the room itself. */
export type CeilingHeightLevel = 'global' | 'pdf' | 'roomType' | 'room';

export interface CeilingHeightContext {
  /** The user setting, mm. Required. */
  globalMm: number;
  /** The height of the drawing, mm. Absent = the global value. */
  pdfMm?: number;
  /** The height per room type id in this drawing, mm. A type without an entry uses the drawing value. */
  roomTypeMm?: Readonly<Record<string, number>>;
}

/** Short names of the levels, for a column or a hint. */
export const CEILING_HEIGHT_LEVEL_LABELS: Record<CeilingHeightLevel, string> = { global: 'Settings', pdf: 'Drawing', roomType: 'Room type', room: 'Room' };

export interface ResolvedCeilingHeight {
  mm: number;
  level: CeilingHeightLevel;
}

/** A ceiling height is a finite number above 0. */
export const isValidCeilingHeightMm = (mm: unknown): mm is number => typeof mm === 'number' && Number.isFinite(mm) && mm > 0;

/** The ceiling height of a room and the level it comes from: room, then room type, then drawing, then global. */
export function resolveCeilingHeight(room: Pick<Room, 'ceilingHeightMm' | 'roomTypeId'>, ctx: CeilingHeightContext): ResolvedCeilingHeight {
  if (isValidCeilingHeightMm(room.ceilingHeightMm)) return { mm: room.ceilingHeightMm, level: 'room' };
  const typeMm = room.roomTypeId !== undefined ? ctx.roomTypeMm?.[room.roomTypeId] : undefined;
  if (isValidCeilingHeightMm(typeMm)) return { mm: typeMm, level: 'roomType' };
  if (isValidCeilingHeightMm(ctx.pdfMm)) return { mm: ctx.pdfMm, level: 'pdf' };
  return { mm: ctx.globalMm, level: 'global' };
}

function ringLengthPt(ring: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return s;
}

/** Length of all walls of the room in metres: the outer ring plus the hole rings (columns and shafts inside the room). */
export function roomPerimeterM(room: Pick<Room, 'polygon'>, calibration: Calibration): number {
  const pt = ringLengthPt(room.polygon.outer) + room.polygon.holes.reduce((sum, h) => sum + ringLengthPt(h), 0);
  return pt / calibration.pageUnitsPerRealUnit / 1000;
}

export interface BoundingRect {
  center: Vec2;
  /** The long side, page points. */
  lengthPt: number;
  /** The short side, page points. */
  widthPt: number;
  /** Direction of the long side in page space (y down), degrees from +x towards +y, in [0, 180). */
  angleDeg: number;
  corners: [Vec2, Vec2, Vec2, Vec2];
}

function convexHull(points: readonly Vec2[]): Vec2[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length < 3) return sorted;
  const cross = (o: Vec2, a: Vec2, b: Vec2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The rectangle of smallest area around the outer ring (convex hull, then one candidate per hull
 * edge). It gives the length, width and main axis of a room, also for a rotated room. Null when
 * the ring has fewer than 3 distinct points.
 */
export function roomMinBoundingRect(room: Pick<Room, 'polygon'>): BoundingRect | null {
  const hull = convexHull(room.polygon.outer);
  if (hull.length < 3) return null;
  let best: { area: number; ux: number; uy: number; minU: number; maxU: number; minN: number; maxN: number } | null = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!;
    const b = hull[(i + 1) % hull.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-9) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let minU = Infinity;
    let maxU = -Infinity;
    let minN = Infinity;
    let maxN = -Infinity;
    for (const p of hull) {
      const u = p.x * ux + p.y * uy;
      const n = -p.x * uy + p.y * ux;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (n < minN) minN = n;
      if (n > maxN) maxN = n;
    }
    const area = (maxU - minU) * (maxN - minN);
    if (!best || area < best.area - 1e-9 * Math.max(1, area)) best = { area, ux, uy, minU, maxU, minN, maxN };
  }
  if (!best) return null;
  const { ux, uy, minU, maxU, minN, maxN } = best;
  const at = (u: number, n: number): Vec2 => ({ x: u * ux - n * uy, y: u * uy + n * ux });
  const corners: [Vec2, Vec2, Vec2, Vec2] = [at(minU, minN), at(maxU, minN), at(maxU, maxN), at(minU, maxN)];
  const alongU = maxU - minU;
  const alongN = maxN - minN;
  const [dx, dy] = alongU >= alongN ? [ux, uy] : [-uy, ux];
  let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  angleDeg = ((angleDeg % 180) + 180) % 180;
  if (angleDeg > 180 - 1e-9) angleDeg = 0;
  return { center: at((minU + maxU) / 2, (minN + maxN) / 2), lengthPt: Math.max(alongU, alongN), widthPt: Math.min(alongU, alongN), angleDeg, corners };
}

/** Room volume in m³: area × ceiling height. */
export function roomVolumeM3(areaM2: number, ceilingHeightMm: number): number {
  return (areaM2 * ceilingHeightMm) / 1000;
}

export interface RoomPeople {
  count: number;
  /** 'room' = the user entered the number on the room; 'roomType' = area ÷ the type's area per person, rounded down. */
  source: 'room' | 'roomType';
}

/** A number of people is a whole number of 0 or more. */
export const isValidPeopleCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;

/** The number of people in a room: the room's own value, else area ÷ the room type's area per person, rounded down (a person who does not fit in the rest of the area does not count). Null when neither is known. */
export function roomPeople(room: Pick<Room, 'people'>, areaM2: number | null, roomType: Pick<RoomType, 'areaPerPersonM2'> | undefined): RoomPeople | null {
  if (isValidPeopleCount(room.people)) return { count: room.people, source: 'room' };
  const per = roomType?.areaPerPersonM2;
  if (areaM2 === null || per === undefined || !(per > 0)) return null;
  // The small tolerance keeps 6.6 m² at 2.2 m² per person at 3 people, not 2 from a rounding error.
  return { count: Math.max(0, Math.floor(areaM2 / per + 1e-9)), source: 'roomType' };
}

/** All values of one room. A value that needs the scale is null when the room's page is not calibrated. */
export interface RoomValues {
  areaM2: number | null;
  perimeterM: number | null;
  lengthM: number | null;
  widthM: number | null;
  /** Main axis of the room (direction of the long side), see BoundingRect.angleDeg. Null for a degenerate polygon. */
  axisDeg: number | null;
  ceilingHeight: ResolvedCeilingHeight;
  volumeM3: number | null;
  people: RoomPeople | null;
}

export function computeRoomValues(room: Room, calibration: Calibration | null, heights: CeilingHeightContext, roomType: RoomType | undefined): RoomValues {
  const areaM2 = calibration ? roomAreaM2(room, calibration) : null;
  const rect = roomMinBoundingRect(room);
  const mmPerPt = calibration ? 1 / calibration.pageUnitsPerRealUnit : null;
  const ceilingHeight = resolveCeilingHeight(room, heights);
  return {
    areaM2,
    perimeterM: calibration ? roomPerimeterM(room, calibration) : null,
    lengthM: rect && mmPerPt !== null ? (rect.lengthPt * mmPerPt) / 1000 : null,
    widthM: rect && mmPerPt !== null ? (rect.widthPt * mmPerPt) / 1000 : null,
    axisDeg: rect?.angleDeg ?? null,
    ceilingHeight,
    volumeM3: areaM2 !== null ? roomVolumeM3(areaM2, ceilingHeight.mm) : null,
    people: roomPeople(room, areaM2, roomType),
  };
}
