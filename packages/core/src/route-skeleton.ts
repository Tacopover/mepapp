// Raster skeleton of a room polygon: the polygon is drawn into a 0/1 mask, then
// Zhang-Suen thinning reduces the mask to a 1 pixel wide center line. Known
// limits: a 2 by 2 blob can disappear, and a diagonal of two pixels can blur.

import type { Vec2 } from './geometry.js';
import type { RoomPolygon } from './rooms/types.js';
import { polygonContainsPoint } from './rooms/room.js';
import { distanceTransform } from './rooms/raster.js';

/** A room drawn as a mask. Pixel (x, y) is at index y * w + x and covers the page rectangle starting at (x0 + x * pixelPt, y0 + y * pixelPt). */
export interface RasterMask {
  mask: Uint8Array;
  w: number;
  h: number;
  x0: number;
  y0: number;
  pixelPt: number;
}

/**
 * Draws the polygon into a mask. A pixel is set when its center is inside the
 * outer ring and outside every hole. The mask has one empty pixel border. When
 * the mask would hold more than maxPixels, the pixel size grows until it fits.
 */
export function rasterizePolygon(polygon: RoomPolygon, pixelPt: number, maxPixels = 4_000_000): RasterMask {
  if (polygon.outer.length < 3 || !(pixelPt > 0)) return { mask: new Uint8Array(9), w: 3, h: 3, x0: 0, y0: 0, pixelPt };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of polygon.outer) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  let pt = pixelPt;
  let w = Math.ceil((maxX - minX) / pt) + 2;
  let h = Math.ceil((maxY - minY) / pt) + 2;
  const limit = Math.max(maxPixels, 9);
  while (w * h > limit) {
    pt *= Math.sqrt((w * h) / limit) * 1.02;
    w = Math.ceil((maxX - minX) / pt) + 2;
    h = Math.ceil((maxY - minY) / pt) + 2;
  }
  const x0 = minX - pt;
  const y0 = minY - pt;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = { x: x0 + (x + 0.5) * pt, y: y0 + (y + 0.5) * pt };
      if (polygonContainsPoint(polygon, c)) mask[y * w + x] = 1;
    }
  }
  return { mask, w, h, x0, y0, pixelPt: pt };
}

/**
 * Thins the mask in place with the Zhang-Suen algorithm. Each sub-iteration
 * collects its deletions first and then applies them. The loop stops when a
 * whole pass deletes nothing. The border pixels stay 0, so the loop covers the
 * interior only.
 */
export function thinMask(raster: RasterMask): void {
  const { mask, w, h } = raster;
  const seq = new Uint8Array(9);
  const del: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let sub = 1; sub <= 2; sub++) {
      del.length = 0;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const p = y * w + x;
          if (!mask[p]) continue;
          const p2 = mask[p - w]!;
          const p3 = mask[p - w + 1]!;
          const p4 = mask[p + 1]!;
          const p5 = mask[p + w + 1]!;
          const p6 = mask[p + w]!;
          const p7 = mask[p + w - 1]!;
          const p8 = mask[p - 1]!;
          const p9 = mask[p - w - 1]!;
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          seq[0] = p2;
          seq[1] = p3;
          seq[2] = p4;
          seq[3] = p5;
          seq[4] = p6;
          seq[5] = p7;
          seq[6] = p8;
          seq[7] = p9;
          seq[8] = p2;
          let a = 0;
          for (let i = 0; i < 8; i++) if (seq[i] === 0 && seq[i + 1] === 1) a++;
          if (a !== 1) continue;
          const removable =
            sub === 1 ? p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0 : p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0;
          if (removable) del.push(p);
        }
      }
      for (const p of del) mask[p] = 0;
      if (del.length) changed = true;
    }
  }
}

export interface PixelNode {
  id: string;
  x: number;
  y: number;
  kind: 'end' | 'junction' | 'bend';
}

export interface PixelEdge {
  from: string;
  to: string;
  pixels: { x: number; y: number }[];
}

export interface PixelGraph {
  nodes: PixelNode[];
  edges: PixelEdge[];
}

const RING_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const RING_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

/** Number of 0-to-1 steps around the ring of the 8 neighbors. Ring order p2..p9 clockwise from north, as in thinMask, closed by p2. */
export function crossingNumber(mask: Uint8Array, w: number, x: number, y: number): number {
  const at = (i: number): number => mask[(y + RING_DY[i % 8]!) * w + x + RING_DX[i % 8]!]!;
  let a = 0;
  for (let i = 0; i < 8; i++) if (at(i) === 0 && at(i + 1) === 1) a++;
  return a;
}

interface PixelGroup {
  kind: PixelNode['kind'];
  cells: number[];
  first: number;
}

/**
 * Turns a thinned mask into nodes and edges. A set pixel with CN 0 or 1 is an
 * end, CN 2 a chain pixel, and CN 3 or more a junction pixel. Junction pixels
 * that touch form one node. A set component with no node pixel is a closed
 * ring with one bend node. The border of the mask is not scanned.
 */
export function pixelGraphOf(raster: RasterMask): PixelGraph {
  const { mask, w, h } = raster;
  const n = w * h;
  const kind = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      const cn = crossingNumber(mask, w, x, y);
      kind[p] = cn <= 1 ? 1 : cn === 2 ? 2 : 3;
    }
  }
  const around = (p: number, d: number): number => {
    const x = (p % w) + RING_DX[d]!;
    const y = Math.floor(p / w) + RING_DY[d]!;
    return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x;
  };
  const dist4 = (a: number, b: number): number =>
    Math.abs((a % w) - (b % w)) + Math.abs(Math.floor(a / w) - Math.floor(b / w));

  const groups: PixelGroup[] = [];
  const inCluster = new Uint8Array(n);
  const stack: number[] = [];
  for (let p = 0; p < n; p++) {
    if (kind[p] === 1) {
      groups.push({ kind: 'end', cells: [p], first: p });
    } else if (kind[p] === 3 && !inCluster[p]) {
      const cells: number[] = [];
      inCluster[p] = 1;
      stack.push(p);
      while (stack.length) {
        const c = stack.pop()!;
        cells.push(c);
        for (let d = 0; d < 8; d++) {
          const q = around(c, d);
          if (q >= 0 && kind[q] === 3 && !inCluster[q]) {
            inCluster[q] = 1;
            stack.push(q);
          }
        }
      }
      groups.push({ kind: 'junction', cells, first: p });
    }
  }

  const seen = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    if (kind[p] !== 2 || seen[p]) continue;
    let hasNode = false;
    seen[p] = 1;
    stack.push(p);
    while (stack.length) {
      const c = stack.pop()!;
      if (kind[c] !== 2) hasNode = true;
      for (let d = 0; d < 8; d++) {
        const q = around(c, d);
        if (q >= 0 && mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (!hasNode) groups.push({ kind: 'bend', cells: [], first: p });
  }

  groups.sort((a, b) => a.first - b.first);
  const nodeOf = new Int32Array(n).fill(-1);
  groups.forEach((g, gi) => {
    for (const c of g.cells) nodeOf[c] = gi;
  });
  const nodes: PixelNode[] = groups.map((g, gi) => {
    const pts = g.cells.length ? g.cells : [g.first];
    let sx = 0;
    let sy = 0;
    for (const c of pts) {
      sx += c % w;
      sy += Math.floor(c / w);
    }
    return { id: `n${gi}`, x: sx / pts.length, y: sy / pts.length, kind: g.kind };
  });

  const pt = (p: number) => ({ x: p % w, y: Math.floor(p / w) });
  const visited = new Uint8Array(n);
  const direct = new Set<number>();
  const edges: PixelEdge[] = [];

  const touching = (c: number, skip: number, fourOnly: boolean): number => {
    for (let d = 0; d < 8; d += fourOnly ? 2 : 1) {
      const q = around(c, d);
      if (q >= 0 && nodeOf[q]! >= 0 && nodeOf[q] !== skip) return q;
    }
    return -1;
  };
  const pick = (c: number, prev: number): number => {
    let best = -1;
    let bestScore = -1;
    for (let d = 0; d < 8; d++) {
      const q = around(c, d);
      if (q < 0 || !mask[q] || kind[q] !== 2 || visited[q]) continue;
      const score = (prev < 0 || dist4(q, prev) !== 1 ? 2 : 0) + (d % 2 === 0 ? 1 : 0);
      if (score > bestScore) {
        best = q;
        bestScore = score;
      }
    }
    return best;
  };
  const walk = (first: number, group: number, from: number): { chain: number[]; end: number } => {
    const chain: number[] = [];
    let prev = from;
    let cur = first;
    for (;;) {
      visited[cur] = 1;
      chain.push(cur);
      const skip = chain.length === 1 ? group : -1;
      const t = touching(cur, skip, true);
      if (t >= 0) return { chain, end: t };
      const nxt = pick(cur, prev);
      if (nxt < 0) return { chain, end: touching(cur, skip, false) };
      prev = cur;
      cur = nxt;
    }
  };

  groups.forEach((g, gi) => {
    const from = nodes[gi]!.id;
    if (g.kind === 'bend') {
      const loop = [g.first];
      visited[g.first] = 1;
      let prev = -1;
      let cur = g.first;
      for (;;) {
        const nxt = pick(cur, prev);
        if (nxt < 0) break;
        visited[nxt] = 1;
        loop.push(nxt);
        prev = cur;
        cur = nxt;
      }
      loop.push(g.first);
      edges.push({ from, to: from, pixels: loop.map(pt) });
      return;
    }
    for (const s of g.cells) {
      for (let d = 0; d < 8; d++) {
        const q = around(s, d);
        if (q < 0 || !mask[q] || nodeOf[q] === gi) continue;
        if (nodeOf[q]! >= 0) {
          const key = Math.min(s, q) * n + Math.max(s, q);
          if (direct.has(key)) continue;
          direct.add(key);
          edges.push({ from, to: nodes[nodeOf[q]!]!.id, pixels: [pt(s), pt(q)] });
        } else if (kind[q] === 2 && !visited[q]) {
          const { chain, end } = walk(q, gi, s);
          if (end < 0) continue;
          edges.push({ from, to: nodes[nodeOf[end]!]!.id, pixels: [pt(s), ...chain.map(pt), pt(end)] });
        }
      }
    }
  });

  return { nodes, edges };
}

/** Distances (px) from every pixel to the nearest EMPTY pixel of the room mask. Call it with the mask of the room BEFORE thinning. */
export function roomDistances(room: RasterMask): Float32Array {
  const inverted = new Uint8Array(room.mask.length);
  for (let i = 0; i < inverted.length; i++) inverted[i] = 1 - room.mask[i]!;
  return distanceTransform(inverted, room.w, room.h);
}

/** Half-width in pixels at pixel (x, y): the value of the distance array there. x and y are rounded to the nearest integer and clamped to the raster. */
export function halfWidthAt(distances: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.min(w - 1, Math.max(0, Math.round(x)));
  const cy = Math.min(h - 1, Math.max(0, Math.round(y)));
  return distances[cy * w + cx]!;
}

/**
 * Removes the short spurs of a pixel graph. A spur is an edge from an end node to a
 * junction or bend node. It goes when its length is at most pruneFactor times the
 * half-width at that junction. Each round removes all spurs at once, then joins the
 * nodes that lost an edge. The last edge of the graph stays. The input graph is not changed.
 */
export function pruneGraph(
  graph: PixelGraph,
  halfWidthPx: (x: number, y: number) => number,
  pruneFactor = 1.5,
): PixelGraph {
  let nodes: PixelNode[] = graph.nodes.map((n) => ({ ...n }));
  let edges: PixelEdge[] = graph.edges.map((e) => ({ from: e.from, to: e.to, pixels: e.pixels.slice() }));
  for (;;) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const spurs: { i: number; end: string; junc: string; len: number }[] = [];
    edges.forEach((e, i) => {
      if (e.from === e.to) return;
      const a = byId.get(e.from)!;
      const b = byId.get(e.to)!;
      const aEnd = a.kind === 'end';
      if (aEnd === (b.kind === 'end')) return;
      const junc = aEnd ? b : a;
      const len = e.pixels.length - 1;
      if (len <= pruneFactor * halfWidthPx(junc.x, junc.y)) {
        spurs.push({ i, end: aEnd ? a.id : b.id, junc: junc.id, len });
      }
    });
    if (spurs.length === edges.length) {
      let keep = 0;
      spurs.forEach((s, k) => {
        if (s.len > spurs[keep]!.len) keep = k;
      });
      spurs.splice(keep, 1);
    }
    if (!spurs.length) break;

    const cut = new Set(spurs.map((s) => s.i));
    const gone = new Set(spurs.map((s) => s.end));
    const touched = new Set(spurs.map((s) => s.junc));
    const dropped = new Set<string>();
    edges = edges.filter((_, i) => !cut.has(i));
    for (const id of touched) {
      const n = byId.get(id)!;
      const inc: number[] = [];
      edges.forEach((e, i) => {
        if (e.from === id || e.to === id) inc.push(i);
      });
      let ends = 0;
      for (const i of inc) ends += (edges[i]!.from === id ? 1 : 0) + (edges[i]!.to === id ? 1 : 0);
      if (ends === 0) {
        dropped.add(id);
      } else if (ends === 1) {
        n.kind = 'end';
      } else if (ends === 2 && inc.length === 2) {
        const i1 = inc[0]!;
        const i2 = inc[1]!;
        const e1 = edges[i1]!;
        const e2 = edges[i2]!;
        const p1 = e1.from === id ? e1.pixels.slice().reverse() : e1.pixels;
        const p2 = e2.from === id ? e2.pixels : e2.pixels.slice().reverse();
        edges[i1] = {
          from: e1.from === id ? e1.to : e1.from,
          to: e2.from === id ? e2.to : e2.from,
          pixels: [...p1, ...p2.slice(1)],
        };
        edges = edges.filter((_, i) => i !== i2);
        dropped.add(id);
      } else if (inc.length === 1) {
        n.kind = 'bend';
      }
    }
    nodes = nodes.filter((n) => !gone.has(n.id) && !dropped.has(n.id));
  }
  return { nodes, edges };
}

export interface CenterLineNode {
  id: string;
  point: Vec2;
  kind: 'end' | 'junction' | 'bend';
}

export interface CenterLineEdge {
  from: string;
  to: string;
  points: Vec2[];
}

export interface CenterLine {
  nodes: CenterLineNode[];
  edges: CenterLineEdge[];
  halfWidthMm: number;
}

// Equal to DEFAULT_SKELETON_PIXEL_MM in route-area.ts. Not imported, to avoid an import cycle.
const DEFAULT_PIXEL_MM = 100;

/**
 * The center line of a room in page points. The room is rasterized at pixelMm
 * (default DEFAULT_PIXEL_MM), thinned, pruned and simplified. For a huge room the
 * pixel size grows and pixelMm is ignored. A room narrower than 300 mm gives an
 * empty center line.
 */
export function centerLineOf(
  polygon: RoomPolygon,
  mmPerPt: number,
  options: { pixelMm?: number; pruneFactor?: number } = {},
): CenterLine {
  if (!(mmPerPt > 0)) return { nodes: [], edges: [], halfWidthMm: 0 };
  const pixelMm = options.pixelMm ?? DEFAULT_PIXEL_MM;
  const room = rasterizePolygon(polygon, pixelMm / mmPerPt);
  const pixelMmEff = room.pixelPt * mmPerPt;
  const distances = roomDistances(room);
  let maxDistance = 0;
  for (let i = 0; i < distances.length; i++) if (distances[i]! > maxDistance) maxDistance = distances[i]!;
  if (2 * maxDistance * pixelMmEff < 300) return { nodes: [], edges: [], halfWidthMm: 0 };
  const thinned = { ...room, mask: room.mask.slice() };
  thinMask(thinned);
  const graph = pruneGraph(
    pixelGraphOf(thinned),
    (x, y) => halfWidthAt(distances, room.w, room.h, x, y),
    options.pruneFactor,
  );

  const toPage = (px: number, py: number): Vec2 => ({
    x: room.x0 + (px + 0.5) * room.pixelPt,
    y: room.y0 + (py + 0.5) * room.pixelPt,
  });
  const at = new Map(graph.nodes.map((n) => [n.id, n]));
  const edges: CenterLineEdge[] = graph.edges
    .filter((e) => at.has(e.from) && at.has(e.to))
    .map((e) => {
      const a = at.get(e.from)!;
      const b = at.get(e.to)!;
      const points = simplifyChain(e.pixels, 1).map((p) => toPage(p.x, p.y));
      points[0] = toPage(a.x, a.y);
      points[points.length - 1] = toPage(b.x, b.y);
      return { from: e.from, to: e.to, points };
    });
  const used = new Set<string>();
  for (const e of edges) {
    used.add(e.from);
    used.add(e.to);
  }
  const nodes: CenterLineNode[] = graph.nodes
    .filter((n) => edges.length === 0 || used.has(n.id))
    .map((n) => ({ id: n.id, point: toPage(n.x, n.y), kind: n.kind }));

  const widths: number[] = [];
  for (const e of graph.edges) {
    for (const p of e.pixels) widths.push(halfWidthAt(distances, room.w, room.h, p.x, p.y));
  }
  if (!widths.length) return { nodes, edges, halfWidthMm: 0 };
  widths.sort((a, b) => a - b);
  const mid = widths.length >> 1;
  const median = widths.length % 2 ? widths[mid]! : (widths[mid - 1]! + widths[mid]!) / 2;
  return { nodes, edges, halfWidthMm: median * pixelMmEff };
}

// Douglas-Peucker for an open chain. A closed loop (first pixel equals last) keeps its first and last pixel.
function simplifyChain(pixels: { x: number; y: number }[], tolerance: number): { x: number; y: number }[] {
  const n = pixels.length;
  if (n < 3) return pixels.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let worstDist = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segmentDistance(pixels[i]!, pixels[a]!, pixels[b]!);
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst >= 0 && worstDist > tolerance) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return pixels.filter((_, i) => keep[i] === 1);
}

function segmentDistance(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.min(1, Math.max(0, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
