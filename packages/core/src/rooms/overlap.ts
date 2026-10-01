// Rooms never overlap. When two polygons overlap, the room with the higher priority keeps the
// shared area and the other room loses it (exact polygon difference). The priority is the
// confidence of the detection (0 to 1); a room the user drew, edited or locked has priority 2
// and is never trimmed by a detected room. An existing room that would lose most of its area
// keeps it instead and the newcomer is trimmed. Plan: .claude/plans/room-detection.md, 8i.

import { overlapAreaPt2, polygonDifference } from './clip.js';
import { polygonAreaPt2, type Room } from './room.js';
import type { RoomPolygon } from './types.js';

/** Confidence of a detected room from the way it was found and how well its area matches the printed one. */
export function roomConfidence(method: string, deviation: number | null): number {
  const base: Record<string, number> = { detected: 0.95, direct: 0.95, plain: 0.7, dissolved: 0.85, gap: 0.8, split: 0.7, bounded: 0.4, label: 0.2 };
  const b = base[method] ?? 0.5;
  return deviation === null ? b * 0.6 : b * (1 - Math.min(Math.abs(deviation), 0.6));
}

/** Priority in an overlap: a room of the user is 2, a detected room its confidence. */
export const roomPriority = (r: Pick<Room, 'locked' | 'source' | 'confidence'>): number => (r.locked || r.source === 'manual' ? 2 : (r.confidence ?? 0.5));

export interface OverlapItem {
  key: string;
  polygon: RoomPolygon;
  priority: number;
  existing: boolean; // an existing room: it keeps its area when it would lose most of it
}

export interface OverlapOptions {
  minKeepFraction?: number; // a room that keeps less than this share of its area is dropped, default 0.3
  minKeepM2?: number; // or less than this many m2, default 0.3
  ignoreM2?: number; // overlaps smaller than this are left alone, default 0.01
}

export interface OverlapResult {
  polygons: Map<string, RoomPolygon>; // final polygon of every kept item
  changed: string[]; // keys whose polygon differs from the input
  dropped: string[]; // keys that lost (almost) everything
}

export function resolveRoomOverlaps(items: readonly OverlapItem[], mmPerPt: number, options: OverlapOptions = {}): OverlapResult {
  const minFrac = options.minKeepFraction ?? 0.3;
  const minPt2 = ((options.minKeepM2 ?? 0.3) * 1e6) / (mmPerPt * mmPerPt);
  const ignorePt2 = ((options.ignoreM2 ?? 0.01) * 1e6) / (mmPerPt * mmPerPt);
  const boost = new Set<string>();
  for (let attempt = 0; attempt <= items.length; attempt++) {
    const order = items
      .map((it, i) => ({ it, i, p: boost.has(it.key) ? 3 : it.priority }))
      .sort((a, b) => b.p - a.p || Number(b.it.existing) - Number(a.it.existing) || a.i - b.i);
    const placed: { key: string; priority: number; polygon: RoomPolygon; original: number }[] = [];
    const polygons = new Map<string, RoomPolygon>();
    const changed: string[] = [];
    const dropped: string[] = [];
    let restart = false;
    for (const { it } of order) {
      const original = polygonAreaPt2(it.polygon);
      const cutters = placed.filter((q) => overlapAreaPt2(it.polygon, q.polygon) > ignorePt2);
      let result = it.polygon;
      let lost = false;
      if (cutters.length > 0) {
        const pieces = polygonDifference(it.polygon, cutters.map((q) => q.polygon));
        const best = pieces[0];
        const kept = best ? polygonAreaPt2(best) : 0;
        if (!best || kept < minPt2 || kept < minFrac * original) lost = true;
        else result = best;
        // An existing room that would lose more than half of its area keeps it: the newcomer gives way instead.
        if (it.existing && !boost.has(it.key) && (lost || kept < 0.5 * original)) {
          boost.add(it.key);
          restart = true;
          break;
        }
      }
      if (lost) {
        // A room inside another room (a workplace in a hall): the larger room gets a hole, when it keeps a fifth of its own area and is not the room of a user.
        const carved = cutters.every((q) => q.priority < 2) ? cutters.map((q) => polygonDifference(q.polygon, [it.polygon])[0]) : [];
        if (carved.length === cutters.length && carved.every((c, k) => c && polygonAreaPt2(c) >= 0.2 * cutters[k]!.original)) {
          cutters.forEach((q, k) => {
            q.polygon = carved[k]!;
            polygons.set(q.key, q.polygon);
            if (!changed.includes(q.key)) changed.push(q.key);
          });
          result = it.polygon;
          lost = false;
        }
      }
      if (lost) {
        dropped.push(it.key);
        continue;
      }
      polygons.set(it.key, result);
      placed.push({ key: it.key, priority: boost.has(it.key) ? 3 : it.priority, polygon: result, original: polygonAreaPt2(result) });
      if (result !== it.polygon && !changed.includes(it.key)) changed.push(it.key);
    }
    if (!restart) return { polygons, changed, dropped };
  }
  return { polygons: new Map(items.map((i) => [i.key, i.polygon])), changed: [], dropped: [] };
}

export interface RoomOverlapPlan {
  update: Room[]; // existing rooms with a trimmed polygon (same ids)
  add: Room[]; // incoming rooms after trimming
  dropped: Room[]; // incoming rooms that lost (almost) everything
}

/**
 * Plans what happens when `incoming` rooms join the `existing` rooms of one page: the room with
 * the higher priority keeps a shared area. A tie goes to the existing room.
 */
export function planRoomOverlaps(existing: readonly Room[], incoming: readonly Room[], mmPerPt: number, options: OverlapOptions = {}): RoomOverlapPlan {
  const items: OverlapItem[] = [
    ...existing.map((r) => ({ key: r.id, polygon: r.polygon, priority: roomPriority(r), existing: true })),
    ...incoming.map((r) => ({ key: r.id, polygon: r.polygon, priority: roomPriority(r), existing: false })),
  ];
  const res = resolveRoomOverlaps(items, mmPerPt, options);
  const changed = new Set(res.changed);
  return {
    update: existing.filter((r) => changed.has(r.id)).map((r) => ({ ...r, polygon: res.polygons.get(r.id)! })),
    add: incoming.filter((r) => res.polygons.has(r.id)).map((r) => (changed.has(r.id) ? { ...r, polygon: res.polygons.get(r.id)! } : r)),
    dropped: incoming.filter((r) => res.dropped.includes(r.id)),
  };
}
