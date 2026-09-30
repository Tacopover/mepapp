// Rooms from labels: one room per room label (name, and often the printed area). The page-level
// detection finds candidate regions; each label takes the region it lies in. A region whose area
// does not fit the printed area is repaired (furniture, wide openings: resolve.ts). A region that
// holds several labels whose printed areas add up to its area is divided among them (edit.ts).
// Regions without a label are not rooms. Plan: .claude/plans/room-detection.md, section 8d.

import type { Vec2 } from '../geometry.js';
import { detectAllRooms } from './detect-all.js';
import { splitByTargets } from './edit.js';
import { polygonAreaPt2, polygonContainsPoint } from './room.js';
import { resolveRoomAt, type ResolveMethod } from './resolve.js';
import { DEFAULT_ROOM_DETECTION_PARAMS, type DetectAllOptions, type FilteredWalls, type LeakRegion, type RoomDetectionParams, type RoomPolygon } from './types.js';

export interface LabelTarget {
  anchor: Vec2; // centre of the label, page points
  printedM2: number | null; // area printed in the label, or null
}

export type LabelledMethod = 'detected' | ResolveMethod | 'split';

export interface LabelledRoom {
  target: number; // index into the targets
  polygon: RoomPolygon;
  areaM2: number;
  method: LabelledMethod;
  deviation: number | null; // area / printed area - 1
  open: boolean; // the fill leaks or is far larger than printed: needs review
  sharedWith: number[]; // other targets inside the same region that were not split off
}

export interface LabelledResult {
  rooms: LabelledRoom[];
  missing: number[]; // targets without any region (walls too dense, or no free space at the label)
  leaks: LeakRegion[];
  cancelled: boolean;
}

export interface LabelledOptions extends DetectAllOptions {
  tolerance?: number; // printed area accepted within this fraction, default 0.15
  splitTolerance?: number; // the printed areas of a shared region may differ this much from its area, default 0.3
}

interface Candidate {
  target: number;
  polygon: RoomPolygon;
  areaM2: number;
  method: LabelledMethod;
  open: boolean;
}

export function detectLabelledRooms(
  walls: FilteredWalls,
  targets: readonly LabelTarget[],
  mmPerPt: number,
  params: Partial<RoomDetectionParams> = {},
  options: LabelledOptions = {},
): LabelledResult {
  const P: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  const tol = options.tolerance ?? 0.15;
  const splitTol = options.splitTolerance ?? 0.3;
  const report = options.onProgress ?? ((): void => undefined);
  const cancelled = options.shouldCancel ?? ((): boolean => false);
  const result: LabelledResult = { rooms: [], missing: [], leaks: [], cancelled: false };

  const all = detectAllRooms(walls, mmPerPt, P, { ...options, minRoomM2: options.minRoomM2 ?? 0.3 });
  result.leaks = all.leaks;
  if (all.cancelled) return { ...result, cancelled: true };
  const pageArea = (p: RoomPolygon): number => polygonAreaPt2(p);

  const candidates: Candidate[] = [];
  // Labels that share one detected region: when their printed areas add up to the region, divide the region among them.
  const regionOfTarget = targets.map((tg) =>
    all.rooms.filter((r) => r.polygon.outer.length >= 3 && polygonContainsPoint(r.polygon, tg.anchor)).sort((x, y) => pageArea(x.polygon) - pageArea(y.polygon))[0],
  );
  const handled = new Set<number>();
  const byRegion = new Map<object, number[]>();
  regionOfTarget.forEach((r, t) => {
    if (!r) return;
    const list = byRegion.get(r);
    if (list) list.push(t);
    else byRegion.set(r, [t]);
  });
  for (const [region, members] of byRegion) {
    if (members.length < 2 || (region as (typeof all.rooms)[number]).flags.open) continue;
    const rm = region as (typeof all.rooms)[number];
    const known = members.reduce((sum, t) => sum + (targets[t]!.printedM2 ?? 0), 0);
    const allKnown = members.every((t) => targets[t]!.printedM2 !== null);
    const fits = allKnown ? Math.abs(known / rm.areaM2 - 1) <= splitTol : known <= rm.areaM2 * 1.1;
    if (!fits) continue;
    const pieces = splitByTargets(rm.polygon, members.map((t) => ({ anchor: targets[t]!.anchor, targetM2: targets[t]!.printedM2 })), mmPerPt);
    if (!pieces) continue;
    members.forEach((t, i) => {
      const polygon = pieces[i]!;
      const areaM2 = (polygonAreaPt2(polygon) * mmPerPt * mmPerPt) / 1e6;
      const printed = targets[t]!.printedM2;
      result.rooms.push({ target: t, polygon, areaM2, method: 'split', deviation: printed ? areaM2 / printed - 1 : null, open: false, sharedWith: [] });
      handled.add(t);
    });
  }
  for (let t = 0; t < targets.length; t++) {
    if (handled.has(t)) continue;
    if (cancelled()) return { ...result, cancelled: true };
    report(t / Math.max(targets.length, 1), 'labels');
    const { anchor, printedM2 } = targets[t]!;
    // Smallest detected region that holds the label.
    const region = all.rooms
      .filter((r) => r.polygon.outer.length >= 3 && polygonContainsPoint(r.polygon, anchor))
      .sort((a, b) => pageArea(a.polygon) - pageArea(b.polygon))[0];
    const direct = region && (printedM2 === null || printedM2 <= 0 || Math.abs(region.areaM2 / printedM2 - 1) <= tol);
    // A label without a printed area inside a leaking region is a note or legend, not a room.
    if (region && (printedM2 === null || printedM2 <= 0) && (region.flags.open || region.areaM2 > 400)) {
      result.missing.push(t);
      continue;
    }
    if (region && direct) {
      candidates.push({ target: t, polygon: region.polygon, areaM2: region.areaM2, method: 'detected', open: region.flags.open });
      continue;
    }
    const r = resolveRoomAt(walls, anchor, printedM2, mmPerPt, P, { tolerance: tol });
    if (r.fill.flags.fillEmpty) {
      if (region) candidates.push({ target: t, polygon: region.polygon, areaM2: region.areaM2, method: 'detected', open: true });
      else result.missing.push(t);
      continue;
    }
    if ((printedM2 === null || printedM2 <= 0) && (r.fill.flags.touchesRoiBorder || r.fill.areaM2 > 400)) {
      result.missing.push(t);
      continue;
    }
    candidates.push({ target: t, polygon: r.fill.polygon, areaM2: r.fill.areaM2, method: r.method, open: r.fill.flags.touchesRoiBorder || r.method === 'bounded' });
  }

  // Regions that hold several labels: split them when the printed areas fit.
  // Two labels share a region when each lies inside the region of the other (areas within 5 %).
  const parent = candidates.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i]!;
      const b = candidates[j]!;
      if (Math.abs(a.areaM2 / b.areaM2 - 1) > 0.05) continue;
      if (polygonContainsPoint(a.polygon, targets[b.target]!.anchor) && polygonContainsPoint(b.polygon, targets[a.target]!.anchor)) parent[find(j)] = find(i);
    }
  }
  const groups = new Map<number, Candidate[]>();
  candidates.forEach((c, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(c);
    else groups.set(root, [c]);
  });
  for (const group of groups.values()) {
    if (group.length === 1) {
      const c = group[0]!;
      const printed = targets[c.target]!.printedM2;
      result.rooms.push({ target: c.target, polygon: c.polygon, areaM2: c.areaM2, method: c.method, deviation: printed ? c.areaM2 / printed - 1 : null, open: c.open || (printed ? c.areaM2 / printed > 1.3 : false), sharedWith: [] });
      continue;
    }
    const first = group[0]!;
    const known = group.reduce((s, c) => s + (targets[c.target]!.printedM2 ?? 0), 0);
    const allKnown = group.every((c) => targets[c.target]!.printedM2 !== null);
    const fits = allKnown ? Math.abs(known / first.areaM2 - 1) <= splitTol : known <= first.areaM2 * 1.1;
    const pieces = fits && !first.open ? splitByTargets(first.polygon, group.map((c) => ({ anchor: targets[c.target]!.anchor, targetM2: targets[c.target]!.printedM2 })), mmPerPt) : null;
    if (pieces) {
      group.forEach((c, i) => {
        const polygon = pieces[i]!;
        const areaM2 = (polygonAreaPt2(polygon) * mmPerPt * mmPerPt) / 1e6;
        const printed = targets[c.target]!.printedM2;
        result.rooms.push({ target: c.target, polygon, areaM2, method: 'split', deviation: printed ? areaM2 / printed - 1 : null, open: false, sharedWith: [] });
      });
    } else {
      for (const c of group) {
        const printed = targets[c.target]!.printedM2;
        result.rooms.push({ target: c.target, polygon: c.polygon, areaM2: c.areaM2, method: c.method, deviation: printed ? c.areaM2 / printed - 1 : null, open: c.open || (printed ? c.areaM2 / printed > 1.3 : false), sharedWith: group.filter((o) => o !== c).map((o) => o.target) });
      }
    }
  }
  result.rooms.sort((a, b) => a.target - b.target);
  report(1, 'labels');
  return result;
}
