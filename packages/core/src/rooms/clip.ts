// Exact polygon operations on room polygons (union, difference, intersection), on top of the
// MIT-licensed polygon-clipping library. Room polygons are in page points.

import * as clipping from 'polygon-clipping';
import type { Vec2 } from '../geometry.js';
import { polygonAreaPt2 } from './room.js';
import type { RoomPolygon } from './types.js';

type Pair = [number, number];
type Ring = Pair[];
type Geom = Ring[][];

// The package has a default export at run time and named exports in its typings.
const pc = ((clipping as unknown as { default?: typeof clipping }).default ?? clipping) as typeof clipping;

const closed = (ring: readonly Vec2[]): Ring => {
  const r = ring.map((p): Pair => [p.x, p.y]);
  if (r.length > 0) r.push([r[0]![0], r[0]![1]]);
  return r;
};
const open = (ring: readonly Pair[]): Vec2[] => ring.slice(0, -1).map(([x, y]) => ({ x, y }));

/** A polygon as a clipping geometry: the outer ring and the hole rings, each closed. */
export const toGeom = (p: RoomPolygon): Geom => [[closed(p.outer), ...p.holes.map(closed)]];

/** Polygons of a clipping result, largest first. Degenerate polygons (fewer than three points) are dropped. */
export function fromGeom(g: readonly (readonly (readonly Pair[])[])[]): RoomPolygon[] {
  return g
    .map((poly) => ({ outer: open(poly[0]!), holes: poly.slice(1).map((r) => open(r)) }))
    .filter((p) => p.outer.length >= 3)
    .sort((a, b) => polygonAreaPt2(b) - polygonAreaPt2(a));
}

export const polygonUnion = (polys: readonly RoomPolygon[]): RoomPolygon[] => (polys.length === 0 ? [] : fromGeom(pc.union(toGeom(polys[0]!), ...polys.slice(1).map(toGeom))));

/** `a` without the parts covered by `cutters`. */
export const polygonDifference = (a: RoomPolygon, cutters: readonly RoomPolygon[]): RoomPolygon[] => (cutters.length === 0 ? [a] : fromGeom(pc.difference(toGeom(a), ...cutters.map(toGeom))));

export const polygonIntersection = (a: RoomPolygon, b: RoomPolygon): RoomPolygon[] => fromGeom(pc.intersection(toGeom(a), toGeom(b)));

/** Area (pt2) that two polygons share. */
export const overlapAreaPt2 = (a: RoomPolygon, b: RoomPolygon): number => polygonIntersection(a, b).reduce((s, p) => s + polygonAreaPt2(p), 0);

/** Axis-aligned rectangle as a polygon. */
export const rectPolygon = (x0: number, y0: number, x1: number, y1: number): RoomPolygon => ({
  outer: [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ],
  holes: [],
});
