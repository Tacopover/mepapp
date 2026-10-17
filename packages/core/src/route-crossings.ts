// Walks a path over the rooms of a page and lists the walls it crosses. The path
// is sampled every stepMm. A wall is the run of empty samples between two rooms.
// Known limit: a gap is measured on the samples, so it is exact only to one step.

import type { Vec2 } from './geometry.js';
import { roomsAtPoint, type Room } from './rooms/room.js';
import { DEFAULT_MAX_WALL_MM } from './route-area.js';

/** A wall that a path crosses between two rooms. Lengths are mm. */
export interface WallCrossing {
  point: Vec2;
  fromRoomId: string | null;
  toRoomId: string | null;
  gapMm: number;
  atMm: number;
}

/** A gap longer than maxWallMm. The path leaves one room and does not reach the next. */
export interface OpenRun {
  from: Vec2;
  to: Vec2;
  lengthMm: number;
  fromRoomId: string | null;
  toRoomId: string | null;
}

interface Sample {
  p: Vec2;
  atMm: number;
  roomId: string | null;
}

function pointAt(path: readonly Vec2[], cum: readonly number[], d: number): Vec2 {
  let i = 0;
  while (i < path.length - 2 && cum[i + 1]! < d) i++;
  const a = path[i]!;
  const b = path[i + 1]!;
  const len = cum[i + 1]! - cum[i]!;
  if (!(len > 0)) return { x: a.x, y: a.y };
  const t = Math.min(1, Math.max(0, (d - cum[i]!) / len));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The walls that a path crosses on one page. The path is in page points; mmPerPt
 * converts points to mm. A gap up to maxWallMm is a crossing, a longer gap is an
 * open run. Crossings and open runs are in path order. Empty samples at the start
 * or the end of the path give nothing, and a path that never changes room gives
 * nothing. The inputs are not changed.
 */
export function crossingsAlongPath(
  rooms: readonly Room[],
  path: readonly Vec2[],
  options: { mmPerPt: number; pageIndex: number; maxWallMm?: number; stepMm?: number },
): { crossings: WallCrossing[]; openRuns: OpenRun[] } {
  const crossings: WallCrossing[] = [];
  const openRuns: OpenRun[] = [];
  const mmPerPt = options.mmPerPt;
  const maxWallMm = options.maxWallMm ?? DEFAULT_MAX_WALL_MM;
  const stepMm = options.stepMm ?? 100;
  if (path.length < 2 || !(mmPerPt > 0) || !(stepMm > 0)) return { crossings, openRuns };
  if (!Number.isFinite(mmPerPt) || !Number.isFinite(stepMm)) return { crossings, openRuns };

  const cum: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const totalPt = cum[cum.length - 1]!;
  if (!Number.isFinite(totalPt)) return { crossings, openRuns };
  const stepPt = stepMm / mmPerPt;
  const distances: number[] = [];
  for (let k = 0; k * stepPt < totalPt - 1e-9; k++) distances.push(k * stepPt);
  distances.push(totalPt);

  const samples: Sample[] = distances.map((d) => {
    const p = pointAt(path, cum, d);
    return { p, atMm: d * mmPerPt, roomId: roomsAtPoint(rooms, p, options.pageIndex)[0]?.id ?? null };
  });

  let last: { roomId: string; sampleIndex: number } | null = null;
  for (let j = 0; j < samples.length; j++) {
    const s = samples[j]!;
    if (s.roomId === null) continue;
    if (last === null || s.roomId === last.roomId) {
      last = { roomId: s.roomId, sampleIndex: j };
      continue;
    }
    const i: number = last.sampleIndex;
    const a = samples[i]!;
    const b = samples[j]!;
    let point: Vec2;
    let atMm: number;
    let gapMm: number;
    if (j === i + 1) {
      point = { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2 };
      atMm = (a.atMm + b.atMm) / 2;
      gapMm = 0;
    } else {
      const n = j - i - 1;
      const mid = samples[i + Math.ceil(n / 2)]!;
      point = mid.p;
      atMm = mid.atMm;
      gapMm = b.atMm - a.atMm;
    }
    if (gapMm <= maxWallMm) {
      crossings.push({ point, fromRoomId: last.roomId, toRoomId: s.roomId, gapMm, atMm });
    } else {
      openRuns.push({ from: a.p, to: b.p, lengthMm: gapMm, fromRoomId: last.roomId, toRoomId: s.roomId });
    }
    last = { roomId: s.roomId, sampleIndex: j };
  }
  return { crossings, openRuns };
}
