// Wall line filter: decides which page segments are wall lines. Port of the
// round 3/4 prototype, see .claude/plans/room-detection-algorithm.md section A.
// The filter never looks at colour or layer, only at geometry.

import {
  DEFAULT_ROOM_DETECTION_PARAMS,
  KIND_CLOSED_FLAG,
  REJECT_REASON,
  SEGMENT_STRIDE,
  SEG_KIND,
  SEG_PATH_ID,
  SEG_WIDTH,
  type RoomDetectionParams,
  type WallCandidateSegments,
  type WallFilterResult,
  type WallFilterStats,
} from './types.js';
import { isLineKind, labelComponents, rasterizeKept, segmentBounds } from './raster.js';

const S = SEGMENT_STRIDE;
const cellKey = (cx: number, cy: number): number => cx * 100003 + cy;
const median = (a: number[]): number => [...a].sort((p, q) => p - q)[a.length >> 1]!;

// Angle of a direction in [0, pi).
function lineAngle(dx: number, dy: number): number {
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI;
  if (a >= Math.PI - 1e-12) a = 0;
  return a;
}

interface PairResult {
  cand: Int32Array; // segment index of each candidate line
  len: Float64Array; // pt
  partners: Uint16Array;
  tagged: Uint8Array; // 1 when partner overlaps cover coverFrac of the line
  pl: (number[] | undefined)[]; // per candidate: flat [offset, from, to] triples of every partner (only for hatchEvidence)
  ang: Float64Array;
  ux: Float64Array;
  uy: Float64Array;
  dd: Float64Array;
}

// A1, A2: pair rule for straight lines.
function pairRule(segs: Float64Array, n: number, mm: number, P: RoomDetectionParams, wantPartnerLists: boolean): PairResult {
  const candList: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!isLineKind(segs[i * S + SEG_KIND]!)) continue;
    const dx = segs[i * S + 2]! - segs[i * S]!;
    const dy = segs[i * S + 3]! - segs[i * S + 1]!;
    if (Math.hypot(dx, dy) * mm >= P.stubMinMm) candList.push(i);
  }
  const cand = Int32Array.from(candList);
  const m = cand.length;
  const ang = new Float64Array(m);
  const len = new Float64Array(m);
  const dd = new Float64Array(m);
  const t0 = new Float64Array(m);
  const t1 = new Float64Array(m);
  const ux = new Float64Array(m);
  const uy = new Float64Array(m);
  const bins: number[][] = Array.from({ length: 180 }, () => []);
  for (let j = 0; j < m; j++) {
    const o = cand[j]! * S;
    const dx = segs[o + 2]! - segs[o]!;
    const dy = segs[o + 3]! - segs[o + 1]!;
    const a = lineAngle(dx, dy);
    ang[j] = a;
    len[j] = Math.hypot(dx, dy);
    ux[j] = Math.cos(a);
    uy[j] = Math.sin(a);
    const pa = segs[o]! * ux[j]! + segs[o + 1]! * uy[j]!;
    const pb = segs[o + 2]! * ux[j]! + segs[o + 3]! * uy[j]!;
    t0[j] = Math.min(pa, pb);
    t1[j] = Math.max(pa, pb);
    dd[j] = -segs[o]! * uy[j]! + segs[o + 1]! * ux[j]!;
    bins[Math.floor((a * 180) / Math.PI) % 180]!.push(j);
  }
  for (const b of bins) b.sort((p, q) => dd[p]! - dd[q]!);
  const maxD = P.maxWallMm / mm;
  const minD = P.minGapMm / mm;
  const minOv = P.minOverlapMm / mm;
  const tol = (P.angTolDeg * Math.PI) / 180;
  const partners = new Uint16Array(m);
  const tagged = new Uint8Array(m);
  const ivs: (number[] | undefined)[] = new Array(m);
  const pl: (number[] | undefined)[] = new Array(m);
  for (let j = 0; j < m; j++) {
    const b0 = Math.floor((ang[j]! * 180) / Math.PI) % 180;
    for (let db = -1; db <= 1; db++) {
      const arr = bins[(b0 + db + 180) % 180]!;
      let lo = 0;
      let hi = arr.length;
      const target = dd[j]! - maxD;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (dd[arr[mid]!]! < target) lo = mid + 1;
        else hi = mid;
      }
      for (let q = lo; q < arr.length; q++) {
        const k = arr[q]!;
        if (dd[k]! > dd[j]! + maxD) break;
        if (k === j) continue;
        if (len[k]! * mm < P.partnerMinMm && len[j]! * mm >= P.partnerMinMm && len[j]! * mm < P.partnerLineMaxMm) continue;
        let da = Math.abs(ang[k]! - ang[j]!);
        da = Math.min(da, Math.PI - da);
        if (da > tol) continue;
        const o = cand[k]! * S;
        const ddk = (-(segs[o]! + segs[o + 2]!) / 2) * uy[j]! + ((segs[o + 1]! + segs[o + 3]!) / 2) * ux[j]! - dd[j]!;
        const ad = Math.abs(ddk);
        if (ad < minD || ad > maxD) continue;
        const pa = segs[o]! * ux[j]! + segs[o + 1]! * uy[j]!;
        const pb = segs[o + 2]! * ux[j]! + segs[o + 3]! * uy[j]!;
        const ov = Math.min(t1[j]!, Math.max(pa, pb)) - Math.max(t0[j]!, Math.min(pa, pb));
        const minLen = Math.min(len[j]!, len[k]!);
        if (ov < Math.min(minOv, 0.6 * minLen) || ov < Math.min(minOv * 0.5, 0.6 * minLen)) continue;
        partners[j]!++;
        const from = Math.max(t0[j]!, Math.min(pa, pb));
        const to = Math.min(t1[j]!, Math.max(pa, pb));
        (ivs[j] ||= []).push(from, to);
        if (wantPartnerLists) (pl[j] ||= []).push(ddk, from, to);
      }
    }
  }
  // A line counts as paired only if its partners cover a fraction of its length (rejects chance pairs of long lines).
  for (let j = 0; j < m; j++) {
    const flat = ivs[j];
    if (!flat) continue;
    const a: [number, number][] = [];
    for (let k = 0; k < flat.length; k += 2) a.push([flat[k]!, flat[k + 1]!]);
    a.sort((p, q) => p[0] - q[0]);
    let cov = 0;
    let cs = a[0]![0];
    let ce = a[0]![1];
    for (let k = 1; k < a.length; k++) {
      if (a[k]![0] <= ce) ce = Math.max(ce, a[k]![1]);
      else {
        cov += ce - cs;
        cs = a[k]![0];
        ce = a[k]![1];
      }
    }
    cov += ce - cs;
    if (cov >= P.coverFrac * len[j]!) tagged[j] = 1;
  }
  return { cand, len, partners, tagged, pl, ang, ux, uy, dd };
}

// Optional hatch evidence: ticks (short lines that cross the band) between a line and its partners.
function hatchEvidenceScan(
  segs: Float64Array,
  n: number,
  mm: number,
  P: RoomDetectionParams,
  pr: PairResult,
): { hs: Float32Array; okp: Uint8Array } {
  const cell = 500 / mm;
  const grid = new Map<number, number[]>();
  const maxL = P.hatchTickMaxMm / mm;
  for (let i = 0; i < n; i++) {
    if (!isLineKind(segs[i * S + SEG_KIND]!)) continue;
    const o = i * S;
    const L = Math.hypot(segs[o + 2]! - segs[o]!, segs[o + 3]! - segs[o + 1]!);
    if (L > maxL || L * mm < 20) continue;
    const mx = (segs[o]! + segs[o + 2]!) / 2;
    const my = (segs[o + 1]! + segs[o + 3]!) / 2;
    const k = cellKey(Math.floor(mx / cell), Math.floor(my / cell));
    let g = grid.get(k);
    if (!g) grid.set(k, (g = []));
    g.push(i);
  }
  const m = pr.cand.length;
  const hs = new Float32Array(m).fill(-1);
  const okp = new Uint8Array(m);
  const minA = Math.cos((P.hatchMinAngDeg * Math.PI) / 180);
  for (let j = 0; j < m; j++) {
    const pl = pr.pl[j];
    if (!pl) continue;
    const ux = pr.ux[j]!;
    const uy = pr.uy[j]!;
    const dj = pr.dd[j]!;
    let best = 0;
    for (let e = 0; e < pl.length; e += 3) {
      const ddk = pl[e]!;
      const lo = pl[e + 1]!;
      const hi = pl[e + 2]!;
      const len = hi - lo;
      if (len <= 0) continue;
      // Band box corners (pt): along [lo, hi], offset [0, ddk].
      const corners: [number, number][] = [
        [lo, 0],
        [hi, 0],
        [lo, ddk],
        [hi, ddk],
      ];
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [a, b] of corners) {
        const cx = a * ux - (dj + b) * uy;
        const cy = a * uy + (dj + b) * ux;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
      }
      let cnt = 0;
      for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
        for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
          for (const i of grid.get(cellKey(cx, cy)) || []) {
            const p = i * S;
            const mx = (segs[p]! + segs[p + 2]!) / 2;
            const my = (segs[p + 1]! + segs[p + 3]!) / 2;
            const a = mx * ux + my * uy;
            const b = -mx * uy + my * ux - dj;
            const f = b / ddk;
            if (a < lo || a > hi || f < 0.05 || f > 0.95) continue;
            const L = Math.hypot(segs[p + 2]! - segs[p]!, segs[p + 3]! - segs[p + 1]!);
            const c = Math.abs(((segs[p + 2]! - segs[p]!) * ux + (segs[p + 3]! - segs[p + 1]!) * uy) / L);
            if (c > minA) continue;
            cnt++;
          }
        }
      }
      const dens = cnt / ((len * mm) / 1000);
      if (dens > best) best = dens;
      if (dens >= P.hatchMinDens || Math.abs(ddk) * mm < P.hatchThinMm) okp[j] = 1;
    }
    hs[j] = best;
  }
  return { hs, okp };
}

// Paired lines with no hatched or thin partner are rejected, unless long or a
// collinear continuation of a supported wall run. Only applies to drawings in
// hatch style (hatched share of long paired metres >= hatchStyleFrac).
function hatchReject(
  segs: Float64Array,
  mm: number,
  P: RoomDetectionParams,
  pr: PairResult,
  hs: Float32Array,
  okp: Uint8Array,
): { rej: Set<number>; share: number } {
  const m = pr.cand.length;
  const tp = P.hatchTouchMm / mm;
  const cell = 400 / mm;
  const grid = new Map<number, number[][]>();
  const rej = new Set<number>();
  const tolA = (P.hatchRunAngDeg * Math.PI) / 180;
  const key = (x: number, y: number): number => cellKey(Math.floor(x / cell), Math.floor(y / cell));
  const addEnds = (j: number): void => {
    const o = pr.cand[j]! * S;
    for (const [x, y] of [
      [segs[o]!, segs[o + 1]!],
      [segs[o + 2]!, segs[o + 3]!],
    ] as [number, number][]) {
      const k = key(x, y);
      let g = grid.get(k);
      if (!g) grid.set(k, (g = []));
      g.push([x, y, pr.ang[j]!]);
    }
  };
  let tot = 0;
  let hat = 0;
  for (let j = 0; j < m; j++) {
    if (!pr.tagged[j] || pr.len[j]! * mm < P.minLenMm || (pr.partners[j]! >= P.hatchPartners && pr.len[j]! * mm < P.hatchMaxLenMm)) continue;
    tot += pr.len[j]!;
    if (hs[j]! >= P.hatchMinDens) hat += pr.len[j]!;
  }
  const share = tot ? hat / tot : 0;
  if (share < P.hatchStyleFrac) return { rej, share };
  for (let j = 0; j < m; j++) {
    if (!pr.tagged[j]) continue;
    if (okp[j] || pr.len[j]! * mm >= P.hatchExemptLenMm || segs[pr.cand[j]! * S + SEG_WIDTH]! < P.hatchRejMinW) addEnds(j);
    else rej.add(j);
  }
  const touches = (x: number, y: number, a: number): boolean => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of grid.get(key(x + dx * cell, y + dy * cell)) || []) {
          if (Math.hypot(q[0]! - x, q[1]! - y) > tp) continue;
          let da = Math.abs(q[2]! - a);
          da = Math.min(da, Math.PI - da);
          if (da <= tolA) return true;
        }
      }
    }
    return false;
  };
  // Body grid: supported lines sampled along their length, for the "both ends touch a supported wall" bridge test.
  const bgrid = new Map<number, Set<number>>();
  const addBody = (j: number): void => {
    const o = pr.cand[j]! * S;
    const L = pr.len[j]!;
    const N = Math.max(1, Math.ceil(L / (cell / 2)));
    for (let k = 0; k <= N; k++) {
      const x = segs[o]! + (k / N) * (segs[o + 2]! - segs[o]!);
      const y = segs[o + 1]! + (k / N) * (segs[o + 3]! - segs[o + 1]!);
      const kk = key(x, y);
      let g = bgrid.get(kk);
      if (!g) bgrid.set(kk, (g = new Set()));
      g.add(j);
    }
  };
  const distTo = (x: number, y: number, j: number): number => {
    const o = pr.cand[j]! * S;
    const dx = segs[o + 2]! - segs[o]!;
    const dy = segs[o + 3]! - segs[o + 1]!;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - segs[o]!) * dx + (y - segs[o + 1]!) * dy) / L2));
    return Math.hypot(x - segs[o]! - t * dx, y - segs[o + 1]! - t * dy);
  };
  const bodyTouch = (x: number, y: number, self: number): boolean => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of bgrid.get(key(x + dx * cell, y + dy * cell)) || []) if (j !== self && distTo(x, y, j) <= tp) return true;
      }
    }
    return false;
  };
  for (let j = 0; j < m; j++) if (pr.tagged[j] && !rej.has(j)) addBody(j);
  for (let changed = true; changed; ) {
    changed = false;
    for (const j of [...rej]) {
      const o = pr.cand[j]! * S;
      const run = touches(segs[o]!, segs[o + 1]!, pr.ang[j]!) || touches(segs[o + 2]!, segs[o + 3]!, pr.ang[j]!);
      const bridge = P.hatchBridge && bodyTouch(segs[o]!, segs[o + 1]!, j) && bodyTouch(segs[o + 2]!, segs[o + 3]!, j);
      if (run || bridge) {
        rej.delete(j);
        addEnds(j);
        addBody(j);
        changed = true;
      }
    }
  }
  return { rej, share };
}

// A4: stubs (short paired lines) stay only when an end touches a long kept line.
function stubTouch(segs: Float64Array, ids: number[], stubs: number[], mm: number, touchMm: number): number[] {
  const cell = 400 / mm;
  const tp = touchMm / mm;
  const grid = new Map<number, number[]>();
  for (const i of ids) {
    const o = i * S;
    const x0 = Math.min(segs[o]!, segs[o + 2]!) - tp;
    const x1 = Math.max(segs[o]!, segs[o + 2]!) + tp;
    const y0 = Math.min(segs[o + 1]!, segs[o + 3]!) - tp;
    const y1 = Math.max(segs[o + 1]!, segs[o + 3]!) + tp;
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
      for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
        const k = cellKey(cx, cy);
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(i);
      }
    }
  }
  const dist = (px: number, py: number, i: number): number => {
    const o = i * S;
    const ax = segs[o]!;
    const ay = segs[o + 1]!;
    const dx = segs[o + 2]! - ax;
    const dy = segs[o + 3]! - ay;
    const L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const out: number[] = [];
  for (const s of stubs) {
    const o = s * S;
    let ok = false;
    for (const [px, py] of [
      [segs[o]!, segs[o + 1]!],
      [segs[o + 2]!, segs[o + 3]!],
    ] as [number, number][]) {
      for (const i of grid.get(cellKey(Math.floor(px / cell), Math.floor(py / cell))) || []) {
        if (i !== s && dist(px, py, i) <= tp) {
          ok = true;
          break;
        }
      }
      if (ok) break;
    }
    if (ok) out.push(s);
  }
  return out;
}

interface Chord {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  from: number;
  to: number;
  mx: number;
  my: number;
  L: number;
  a: number;
  ux: number;
  uy: number;
  tag: boolean;
}

// A5: curve rule. Chords of concentric curves that face each other are wall pieces.
function curveRule(segs: Float64Array, n: number, mm: number, P: RoomDetectionParams): { keep: Uint8Array; nChords: number; nTagged: number } {
  const chords: Chord[] = [];
  let i = 0;
  while (i < n) {
    const k = segs[i * S + SEG_KIND]! & 3;
    if (k <= 1) {
      i++;
      continue;
    }
    const id = segs[i * S + SEG_PATH_ID]!;
    let j = i;
    while (j < n && (segs[j * S + SEG_KIND]! & 3) > 1 && segs[j * S + SEG_PATH_ID] === id) j++;
    let s = i;
    let acc = 0;
    for (let q = i; q < j; q++) {
      acc += Math.hypot(segs[q * S + 2]! - segs[q * S]!, segs[q * S + 3]! - segs[q * S + 1]!);
      if (acc * mm >= P.curveChordMm || q === j - 1) {
        if (acc * mm >= P.curveChordMm * 0.4) {
          chords.push({
            ax: segs[s * S]!,
            ay: segs[s * S + 1]!,
            bx: segs[q * S + 2]!,
            by: segs[q * S + 3]!,
            from: s,
            to: q,
            mx: 0,
            my: 0,
            L: 0,
            a: 0,
            ux: 0,
            uy: 0,
            tag: false,
          });
        }
        s = q + 1;
        acc = 0;
      }
    }
    i = j;
  }
  const maxD = P.maxWallMm / mm;
  const minD = P.minGapMm / mm;
  const tol = (P.curveAngTolDeg * Math.PI) / 180;
  const cell = maxD * 2 + 1;
  const grid = new Map<number, number[]>();
  chords.forEach((c, idx) => {
    c.mx = (c.ax + c.bx) / 2;
    c.my = (c.ay + c.by) / 2;
    c.L = Math.hypot(c.bx - c.ax, c.by - c.ay);
    let a = Math.atan2(c.by - c.ay, c.bx - c.ax);
    if (a < 0) a += Math.PI;
    c.a = a;
    c.ux = Math.cos(a);
    c.uy = Math.sin(a);
    const key = cellKey(Math.floor(c.mx / cell), Math.floor(c.my / cell));
    let g = grid.get(key);
    if (!g) grid.set(key, (g = []));
    g.push(idx);
  });
  const keep = new Uint8Array(n);
  let nTagged = 0;
  chords.forEach((c, idx) => {
    const cx = Math.floor(c.mx / cell);
    const cy = Math.floor(c.my / cell);
    for (let dx = -2; dx <= 2 && !c.tag; dx++) {
      for (let dy = -2; dy <= 2 && !c.tag; dy++) {
        for (const q of grid.get(cellKey(cx + dx, cy + dy)) || []) {
          if (q === idx) continue;
          const d = chords[q]!;
          let da = Math.abs(c.a - d.a);
          da = Math.min(da, Math.PI - da);
          if (da > tol) continue;
          const dist = Math.abs(-(d.mx - c.mx) * c.uy + (d.my - c.my) * c.ux);
          if (dist < minD || dist > maxD) continue;
          const along = Math.abs((d.mx - c.mx) * c.ux + (d.my - c.my) * c.uy);
          const ov = (c.L + d.L) / 2 - along;
          if (ov < P.curveOverlapFrac * Math.min(c.L, d.L)) continue;
          c.tag = true;
          break;
        }
      }
    }
    if (c.tag) {
      nTagged++;
      for (let q = c.from; q <= c.to; q++) keep[q] = 1;
    }
  });
  return { keep, nChords: chords.length, nTagged };
}

// A6: loop rule. Small compact closed loops are furniture, except columns that bridge two wall ends.
function loopRule(segs: Float64Array, n: number, keep: Uint8Array, reason: Uint8Array, mm: number, P: RoomDetectionParams): { dropped: number; bridged: number } {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!(segs[i * S + SEG_KIND]! & KIND_CLOSED_FLAG)) continue;
    const id = segs[i * S + SEG_PATH_ID]!;
    let g = groups.get(id);
    if (!g) groups.set(id, (g = []));
    g.push(i);
  }
  interface Cand {
    g: number[];
    ux: number;
    uy: number;
    a0: number;
    a1: number;
    b0: number;
    b1: number;
  }
  const cands: Cand[] = [];
  for (const g of groups.values()) {
    let bi = g[0]!;
    let bl = 0;
    for (const i of g) {
      const l = Math.hypot(segs[i * S + 2]! - segs[i * S]!, segs[i * S + 3]! - segs[i * S + 1]!);
      if (l > bl) {
        bl = l;
        bi = i;
      }
    }
    const o = bi * S;
    const ux = (segs[o + 2]! - segs[o]!) / (bl || 1);
    const uy = (segs[o + 3]! - segs[o + 1]!) / (bl || 1);
    let a0 = 1e18;
    let a1 = -1e18;
    let b0 = 1e18;
    let b1 = -1e18;
    for (const i of g) {
      for (let e = 0; e < 4; e += 2) {
        const x = segs[i * S + e]!;
        const y = segs[i * S + e + 1]!;
        const a = x * ux + y * uy;
        const b = -x * uy + y * ux;
        if (a < a0) a0 = a;
        if (a > a1) a1 = a;
        if (b < b0) b0 = b;
        if (b > b1) b1 = b;
      }
    }
    const w = Math.max(a1 - a0, b1 - b0) * mm;
    const h = Math.min(a1 - a0, b1 - b0) * mm;
    if ((w < P.furnMaxMm && h > P.furnMinMm && w / h < P.furnAspect) || (h > P.furnThickMm && w < P.furnBigMaxMm)) {
      cands.push({ g, ux, uy, a0, a1, b0, b1 });
    }
  }
  const isCand = new Uint8Array(n);
  for (const c of cands) for (const i of c.g) isCand[i] = 1;
  // Grid of wall end points (kept, not candidate).
  const cell = 600 / mm;
  const tp = P.bridgeTouchMm / mm;
  const grid = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!keep[i] || isCand[i]) continue;
    for (let e = 0; e < 4; e += 2) {
      const x = segs[i * S + e]!;
      const y = segs[i * S + e + 1]!;
      const k = cellKey(Math.floor(x / cell), Math.floor(y / cell));
      let a = grid.get(k);
      if (!a) grid.set(k, (a = []));
      a.push(x, y);
    }
  }
  let dropped = 0;
  let bridged = 0;
  for (const c of cands) {
    let mnx = 1e18;
    let mny = 1e18;
    let mxx = -1e18;
    let mxy = -1e18;
    for (const i of c.g) {
      for (let e = 0; e < 4; e += 2) {
        const x = segs[i * S + e]!;
        const y = segs[i * S + e + 1]!;
        mnx = Math.min(mnx, x);
        mny = Math.min(mny, y);
        mxx = Math.max(mxx, x);
        mxy = Math.max(mxy, y);
      }
    }
    const sides = [0, 0, 0, 0];
    for (let cx = Math.floor((mnx - tp) / cell); cx <= Math.floor((mxx + tp) / cell); cx++) {
      for (let cy = Math.floor((mny - tp) / cell); cy <= Math.floor((mxy + tp) / cell); cy++) {
        const a = grid.get(cellKey(cx, cy));
        if (!a) continue;
        for (let q = 0; q < a.length; q += 2) {
          const pa = a[q]! * c.ux + a[q + 1]! * c.uy;
          const pb = -a[q]! * c.uy + a[q + 1]! * c.ux;
          if (pa < c.a0 - tp || pa > c.a1 + tp || pb < c.b0 - tp || pb > c.b1 + tp) continue;
          const d = [Math.abs(pa - c.a0), Math.abs(pa - c.a1), Math.abs(pb - c.b0), Math.abs(pb - c.b1)];
          let bk = 0;
          for (let k = 1; k < 4; k++) if (d[k]! < d[bk]!) bk = k;
          if (d[bk]! <= tp) sides[bk] = 1;
        }
      }
    }
    if ((sides[0] && sides[1]) || (sides[2] && sides[3])) {
      bridged++;
      for (const i of c.g) {
        keep[i] = 1;
        reason[i] = REJECT_REASON.kept;
      }
      continue;
    }
    for (const i of c.g) {
      if (keep[i]) dropped++;
      keep[i] = 0;
    }
  }
  return { dropped, bridged };
}

interface StairItem {
  i: number;
  a: number;
  L: number;
  d: number; // perpendicular offset, mm
  t0: number; // along-axis interval, mm
  t1: number;
}

// A7: stair rule. Chains of parallel, equal, evenly spaced lines are treads.
function stairRule(segs: Float64Array, n: number, keep: Uint8Array, mm: number, P: RoomDetectionParams): number {
  const items: StairItem[] = [];
  for (let i = 0; i < n; i++) {
    if (!keep[i] || !isLineKind(segs[i * S + SEG_KIND]!)) continue;
    const o = i * S;
    const dx = segs[o + 2]! - segs[o]!;
    const dy = segs[o + 3]! - segs[o + 1]!;
    const L = Math.hypot(dx, dy) * mm;
    if (L < P.stairMinLenMm || L > P.stairMaxLenMm) continue;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI;
    if (a >= Math.PI - 1e-9) a = 0;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const pa = segs[o]! * ux + segs[o + 1]! * uy;
    const pb = segs[o + 2]! * ux + segs[o + 3]! * uy;
    items.push({ i, a, L, d: (-segs[o]! * uy + segs[o + 1]! * ux) * mm, t0: Math.min(pa, pb) * mm, t1: Math.max(pa, pb) * mm });
  }
  const bins = new Map<number, StairItem[]>();
  for (const it of items) {
    const kk = Math.round((it.a * 180) / Math.PI) % 180;
    let g = bins.get(kk);
    if (!g) bins.set(kk, (g = []));
    g.push(it);
  }
  const mark = new Set<number>();
  const chains: { chain: StairItem[]; pitch: number }[] = [];
  for (const g of bins.values()) {
    g.sort((p, q) => p.d - q.d);
    const pos = new Map<StairItem, number>();
    g.forEach((it, k) => pos.set(it, k));
    for (let s = 0; s < g.length; s++) {
      if (mark.has(g[s]!.i)) continue;
      const chain = [g[s]!];
      let pitch = 0;
      for (;;) {
        const last = chain[chain.length - 1]!;
        let nx: StairItem | null = null;
        for (let k = pos.get(last)! + 1; k < g.length; k++) {
          const c = g[k]!;
          const sp = c.d - last.d;
          if (sp > P.stairMaxPitchMm) break;
          if (sp < P.stairMinPitchMm) continue;
          if (chain.length >= 2 && Math.abs(sp - pitch) > 0.2 * pitch) continue;
          const ov = Math.min(last.t1, c.t1) - Math.max(last.t0, c.t0);
          if (ov < 0.8 * Math.min(last.L, c.L)) continue;
          if (Math.min(last.L, c.L) / Math.max(last.L, c.L) < P.stairLenRatio) continue;
          nx = c;
          pitch = chain.length === 1 ? sp : (pitch * (chain.length - 1) + sp) / chain.length;
          break;
        }
        if (!nx) break;
        chain.push(nx);
      }
      if (chain.length >= P.stairMinSteps) {
        for (const c of chain) mark.add(c.i);
        chains.push({ chain, pitch });
      }
    }
  }
  if (P.stairBox) {
    for (const { chain, pitch } of chains) {
      const a = chain[0]!.a;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const dmin = chain[0]!.d;
      const dmax = chain[chain.length - 1]!.d;
      if (dmax - dmin > P.stairBoxMaxSpanMm) continue;
      const T0 = median(chain.map((c) => c.t0));
      const T1 = median(chain.map((c) => c.t1));
      for (let i = 0; i < n; i++) {
        if (!keep[i] || mark.has(i) || !isLineKind(segs[i * S + SEG_KIND]!)) continue;
        const o = i * S;
        const ax = segs[o]!;
        const ay = segs[o + 1]!;
        const bx = segs[o + 2]!;
        const by = segs[o + 3]!;
        const ta = (ax * ux + ay * uy) * mm;
        const tb = (bx * ux + by * uy) * mm;
        const da = (-ax * uy + ay * ux) * mm;
        const db = (-bx * uy + by * ux) * mm;
        const L = Math.hypot(bx - ax, by - ay) * mm;
        if (L < 100) continue;
        if (Math.abs(ta - tb) >= Math.abs(da - db)) {
          // Parallel to the treads.
          if (Math.abs(da - db) > L * 0.03) continue;
          if (L > 1.25 * (T1 - T0) + 200) continue;
          const d = (da + db) / 2;
          if (d < dmin - 0.6 * pitch || d > dmax + 0.6 * pitch) continue;
          const ov = Math.min(T1, Math.max(ta, tb)) - Math.max(T0, Math.min(ta, tb));
          if (ov >= 0.8 * Math.min(L, T1 - T0)) mark.add(i);
        } else {
          // Perpendicular: a stringer at a tread end.
          if (Math.abs(ta - tb) > L * 0.03) continue;
          const t = (ta + tb) / 2;
          if (Math.abs(t - T0) > P.stairEndTolMm && Math.abs(t - T1) > P.stairEndTolMm) continue;
          const lo = Math.min(da, db);
          const hi = Math.max(da, db);
          const ov = Math.min(hi, dmax) - Math.max(lo, dmin);
          if (ov >= 0.8 * (dmax - dmin) && L <= dmax - dmin + 1000) mark.add(i);
        }
      }
    }
  }
  let dropped = 0;
  for (const i of mark) {
    keep[i] = 0;
    dropped++;
  }
  return dropped;
}

/**
 * Returns a function that counts the segments with an end point within `tolPt` of an end point of segment i
 * and a direction at least 20 degrees off (lines that end on it, not pieces of the same line).
 */
function endContactCounter(segs: Float64Array, n: number, tolPt: number): (i: number) => number {
  const cell = Math.max(tolPt, 1e-6);
  const grid = new Map<string, number[]>();
  for (let j = 0; j < n; j++) {
    for (const e of [0, 2]) {
      const key = `${Math.floor(segs[j * S + e]! / cell)},${Math.floor(segs[j * S + e + 1]! / cell)}`;
      const list = grid.get(key);
      if (list) list.push(j);
      else grid.set(key, [j]);
    }
  }
  const sinMin = Math.sin((20 * Math.PI) / 180);
  return (i: number): number => {
    const o = i * S;
    const ux = segs[o + 2]! - segs[o]!;
    const uy = segs[o + 3]! - segs[o + 1]!;
    const ul = Math.hypot(ux, uy);
    const found = new Set<number>();
    for (const e of [0, 2]) {
      const px = segs[o + e]!;
      const py = segs[o + e + 1]!;
      for (let cx = Math.floor((px - tolPt) / cell); cx <= Math.floor((px + tolPt) / cell); cx++) {
        for (let cy = Math.floor((py - tolPt) / cell); cy <= Math.floor((py + tolPt) / cell); cy++) {
          for (const j of grid.get(`${cx},${cy}`) ?? []) {
            if (j === i || found.has(j)) continue;
            const q = j * S;
            const vx = segs[q + 2]! - segs[q]!;
            const vy = segs[q + 3]! - segs[q + 1]!;
            const vl = Math.hypot(vx, vy);
            if (vl === 0 || ul === 0 || Math.abs(ux * vy - uy * vx) / (ul * vl) < sinMin) continue;
            const d = Math.min(Math.hypot(segs[q]! - px, segs[q + 1]! - py), Math.hypot(segs[q + 2]! - px, segs[q + 3]! - py));
            if (d <= tolPt) found.add(j);
          }
        }
      }
    }
    return found.size;
  };
}

// A8: dash rule. Runs of similar short pieces on one line, with regular gaps and free ends, are dashed grid
// lines. Every line piece counts for the pattern, also pieces that earlier rules dropped, so a dash whose
// neighbours are already gone is still seen. A run whose piece ends touch other lines is not dashed: window
// glass lines repeat like dashes, but the window frames end on them.
function dashRule(segs: Float64Array, n: number, keep: Uint8Array, mm: number, P: RoomDetectionParams): number {
  const contacts = endContactCounter(segs, n, P.dashEndTolMm / mm);
  interface Piece {
    i: number;
    t0: number;
    t1: number;
    L: number;
  }
  const groups = new Map<string, Piece[]>();
  for (let i = 0; i < n; i++) {
    if (!isLineKind(segs[i * S + SEG_KIND]!)) continue;
    const o = i * S;
    const dx = segs[o + 2]! - segs[o]!;
    const dy = segs[o + 3]! - segs[o + 1]!;
    const L = Math.hypot(dx, dy);
    if (L * mm > 3000 || L * mm < P.dashMinPieceMm) continue;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI;
    if (a >= Math.PI - 1e-9) a = 0;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const d = -segs[o]! * uy + segs[o + 1]! * ux;
    const key = `${Math.round(((a * 180) / Math.PI) * 2)}|${Math.round(d / 0.3)}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = []));
    const pa = segs[o]! * ux + segs[o + 1]! * uy;
    const pb = segs[o + 2]! * ux + segs[o + 3]! * uy;
    g.push({ i, t0: Math.min(pa, pb), t1: Math.max(pa, pb), L });
  }
  let dropped = 0;
  interface Interval {
    t0: number;
    t1: number;
    members: number[];
  }
  for (const g of groups.values()) {
    g.sort((p, q) => p.t0 - q.t0);
    // Merge duplicates and overlapping pieces into intervals.
    const iv: Interval[] = [];
    for (const s of g) {
      const l = iv[iv.length - 1];
      if (l && s.t0 <= l.t1 + 0.05) {
        l.t1 = Math.max(l.t1, s.t1);
        l.members.push(s.i);
      } else iv.push({ t0: s.t0, t1: s.t1, members: [s.i] });
    }
    if (iv.length < P.dashMinRun) continue;
    let run: Interval[] = [iv[0]!];
    const similar = (xs: number[]): boolean => {
      const m = [...xs].sort((p, q) => p - q)[xs.length >> 1]!;
      return xs.every((x) => x > 0.4 * m && x < 2.2 * m);
    };
    // Is the window run[a..b) a dashed pattern? Dash-dot lines alternate a long and a short piece: each of the
    // two series is then regular on its own.
    const regular = (w: Interval[]): boolean => {
      const lens = w.map((r) => r.t1 - r.t0);
      const med = [...lens].sort((p, q) => p - q)[lens.length >> 1]!;
      const okLen = similar(lens) || (w.length >= 4 && similar(lens.filter((_, k) => k % 2 === 0)) && similar(lens.filter((_, k) => k % 2 === 1)));
      const gaps: number[] = [];
      for (let k = 1; k < w.length; k++) gaps.push(w[k]!.t0 - w[k - 1]!.t1);
      const gm = [...gaps].sort((p, q) => p - q)[gaps.length >> 1]!;
      const okGap = gm > 0.03 * med && gaps.every((x) => x > 0.4 * gm && x < 2.2 * gm + 0.5);
      if (!okLen || !okGap) return false;
      const touching = w.map((r) => contacts(r.members[0]!)).sort((p, q) => p - q);
      return touching[touching.length >> 1]! <= P.dashMaxContacts;
    };
    // Every window of consecutive pieces is tested on its own, so one odd piece (a grid bubble, a crossing line)
    // does not hide the dashes of the rest of the line.
    const flush = (): void => {
      const size = Math.max(P.dashMinRun, Math.min(4, run.length));
      if (run.length >= P.dashMinRun) {
        for (let a = 0; a + size <= run.length; a++) {
          const w = run.slice(a, a + size);
          if (!regular(w)) continue;
          for (const r of w) {
            for (const i of r.members) {
              if (keep[i]) {
                keep[i] = 0;
                dropped++;
              }
            }
          }
        }
      }
      run = [];
    };
    for (let k = 1; k < iv.length; k++) {
      const lastIv = run[run.length - 1]!;
      const gap = iv[k]!.t0 - lastIv.t1;
      const ref = Math.max(lastIv.t1 - lastIv.t0, iv[k]!.t1 - iv[k]!.t0);
      if (gap > 0.02 * ref && gap < 3 * ref) run.push(iv[k]!);
      else {
        flush();
        run = [iv[k]!];
      }
    }
    flush();
  }
  return dropped;
}

// A8b: door rule. CAD exports draw a door swing arc as a chain of short straight pieces around the hinge. The
// door leaf and the lines across the door opening run from the hinge to an arc end: they are not walls. The gap
// fill closes the opening again, but the door lines no longer join free-standing partitions to the walls.
function doorRule(segs: Float64Array, n: number, keep: Uint8Array, mm: number, P: RoomDetectionParams): number {
  const minPiece = 5 / mm;
  const maxPiece = 300 / mm;
  const tol = 2 / mm;
  const pieces: number[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * S;
    const L = Math.hypot(segs[o + 2]! - segs[o]!, segs[o + 3]! - segs[o + 1]!);
    if (L >= minPiece && L <= maxPiece) pieces.push(i);
  }
  const grid = new Map<number, number[]>();
  for (const i of pieces) {
    for (const e of [0, 2]) {
      const key = cellKey(Math.floor(segs[i * S + e]! / tol), Math.floor(segs[i * S + e + 1]! / tol));
      const g = grid.get(key);
      if (g) g.push(i);
      else grid.set(key, [i]);
    }
  }
  // Union pieces that share an end, turn by 2 to 30 degrees and have similar lengths.
  const parent = new Map<number, number>();
  const find = (i: number): number => {
    let r = i;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(i, r);
    return r;
  };
  for (const i of pieces) parent.set(i, i);
  const minTurn = Math.sin((2 * Math.PI) / 180);
  const maxTurn = Math.cos((30 * Math.PI) / 180);
  for (const i of pieces) {
    const o = i * S;
    const ux = segs[o + 2]! - segs[o]!;
    const uy = segs[o + 3]! - segs[o + 1]!;
    const ul = Math.hypot(ux, uy);
    for (const e of [0, 2]) {
      const px = segs[o + e]!;
      const py = segs[o + e + 1]!;
      const cx = Math.floor(px / tol);
      const cy = Math.floor(py / tol);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const j of grid.get(cellKey(cx + dx, cy + dy)) ?? []) {
            if (j <= i) continue;
            const q = j * S;
            const vx = segs[q + 2]! - segs[q]!;
            const vy = segs[q + 3]! - segs[q + 1]!;
            const vl = Math.hypot(vx, vy);
            if (vl > 1.6 * ul || ul > 1.6 * vl) continue;
            if (Math.min(Math.hypot(segs[q]! - px, segs[q + 1]! - py), Math.hypot(segs[q + 2]! - px, segs[q + 3]! - py)) > tol) continue;
            const cos = Math.abs(ux * vx + uy * vy) / (ul * vl);
            const sin = Math.abs(ux * vy - uy * vx) / (ul * vl);
            if (sin < minTurn || cos < maxTurn) continue;
            parent.set(find(j), find(i));
          }
        }
      }
    }
  }
  const chains = new Map<number, number[]>();
  for (const i of pieces) {
    const r = find(i);
    const c = chains.get(r);
    if (c) c.push(i);
    else chains.set(r, [i]);
  }
  // Kept line pieces, for the search of door lines near a hinge.
  const lineCell = P.doorMaxRadiusMm / mm;
  const lines = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const key = cellKey(Math.floor((segs[i * S]! + segs[i * S + 2]!) / 2 / lineCell), Math.floor((segs[i * S + 1]! + segs[i * S + 3]!) / 2 / lineCell));
    const g = lines.get(key);
    if (g) g.push(i);
    else lines.set(key, [i]);
  }
  const sinPar = Math.sin((5 * Math.PI) / 180);
  let dropped = 0;
  for (const chain of chains.values()) {
    if (chain.length < 4) continue;
    // Circle through the chain end points (algebraic least squares fit, coordinates relative to the first point).
    const pts: [number, number][] = [];
    for (const i of chain) pts.push([segs[i * S]!, segs[i * S + 1]!], [segs[i * S + 2]!, segs[i * S + 3]!]);
    const [x0, y0] = pts[0]!;
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let sxz = 0;
    let syz = 0;
    for (const [px, py] of pts) {
      const x = px - x0;
      const y = py - y0;
      const z = x * x + y * y;
      sxx += x * x;
      sxy += x * y;
      syy += y * y;
      sx += x;
      sy += y;
      sz += z;
      sxz += x * z;
      syz += y * z;
    }
    const m = pts.length;
    // Solve [sxx sxy sx; sxy syy sy; sx sy m] [a b c] = [-sxz -syz -sz] for x2 + y2 + a x + b y + c = 0.
    const det = sxx * (syy * m - sy * sy) - sxy * (sxy * m - sy * sx) + sx * (sxy * sy - syy * sx);
    if (Math.abs(det) < 1e-12) continue;
    const r0 = -sxz;
    const r1 = -syz;
    const r2 = -sz;
    const a = (r0 * (syy * m - sy * sy) - sxy * (r1 * m - sy * r2) + sx * (r1 * sy - syy * r2)) / det;
    const b = (sxx * (r1 * m - r2 * sy) - r0 * (sxy * m - sy * sx) + sx * (sxy * r2 - r1 * sx)) / det;
    const c = (sxx * (syy * r2 - sy * r1) - sxy * (sxy * r2 - r1 * sx) + r0 * (sxy * sy - syy * sx)) / det;
    const hx = x0 - a / 2;
    const hy = y0 - b / 2;
    const R = Math.sqrt(Math.max(0, (a * a + b * b) / 4 - c));
    if (R * mm < P.doorMinRadiusMm || R * mm > P.doorMaxRadiusMm) continue;
    if (pts.some(([px, py]) => Math.abs(Math.hypot(px - hx, py - hy) - R) > 0.03 * R)) continue;
    // Arc ends: the end points at both sides of the largest angle gap.
    const ang = pts.map(([px, py]) => Math.atan2(py - hy, px - hx)).sort((p, q) => p - q);
    let gap = ang[0]! + 2 * Math.PI - ang[ang.length - 1]!;
    let endA = ang[0]!;
    let endB = ang[ang.length - 1]!;
    for (let k = 1; k < ang.length; k++) {
      if (ang[k]! - ang[k - 1]! > gap) {
        gap = ang[k]! - ang[k - 1]!;
        endA = ang[k]!;
        endB = ang[k - 1]!;
      }
    }
    const sweep = 2 * Math.PI - gap;
    if (sweep < Math.PI / 4 || sweep > (100 * Math.PI) / 180) continue;
    const band = P.doorBandMm / mm;
    const hcx = Math.floor(hx / lineCell);
    const hcy = Math.floor(hy / lineCell);
    const along = (e: number, i: number): { t0: number; t1: number; d0: number; d1: number } | null => {
      const ux = Math.cos(e);
      const uy = Math.sin(e);
      const o = i * S;
      const vx = segs[o + 2]! - segs[o]!;
      const vy = segs[o + 3]! - segs[o + 1]!;
      const vl = Math.hypot(vx, vy);
      if (vl === 0 || Math.abs(ux * vy - uy * vx) / vl > sinPar) return null;
      return {
        t0: (segs[o]! - hx) * ux + (segs[o + 1]! - hy) * uy,
        t1: (segs[o + 2]! - hx) * ux + (segs[o + 3]! - hy) * uy,
        d0: -(segs[o]! - hx) * uy + (segs[o + 1]! - hy) * ux,
        d1: -(segs[o + 2]! - hx) * uy + (segs[o + 3]! - hy) * ux,
      };
    };
    const near: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.push(...(lines.get(cellKey(hcx + dx, hcy + dy)) ?? []));
    // The arc end in the wall: a wall line on that side runs on past the hinge or past the end. Its door lines close the opening and stay.
    const inWall = (e: number): boolean =>
      near.some((i) => {
        const g = along(e, i);
        return g !== null && Math.abs(g.d0) <= band && Math.abs(g.d1) <= band && (Math.min(g.t0, g.t1) < -0.2 * R || Math.max(g.t0, g.t1) > 1.2 * R);
      });
    for (const e of [endA, endB]) {
      if (P.doorKeepWallSide && inWall(e)) continue;
      const ux = Math.cos(e);
      const uy = Math.sin(e);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const i of lines.get(cellKey(hcx + dx, hcy + dy)) ?? []) {
            if (!keep[i] || !isLineKind(segs[i * S + SEG_KIND]!)) continue;
            const o = i * S;
            const vx = segs[o + 2]! - segs[o]!;
            const vy = segs[o + 3]! - segs[o + 1]!;
            const vl = Math.hypot(vx, vy);
            if (vl === 0 || Math.abs(ux * vy - uy * vx) / vl > sinPar) continue;
            const t0 = (segs[o]! - hx) * ux + (segs[o + 1]! - hy) * uy;
            const t1 = (segs[o + 2]! - hx) * ux + (segs[o + 3]! - hy) * uy;
            const d0 = -(segs[o]! - hx) * uy + (segs[o + 1]! - hy) * ux;
            const d1 = -(segs[o + 2]! - hx) * uy + (segs[o + 3]! - hy) * ux;
            if (Math.abs(d0) > band || Math.abs(d1) > band) continue;
            if (Math.min(t0, t1) < -0.1 * R || Math.max(t0, t1) > 1.1 * R || Math.abs(t1 - t0) < 0.8 * R) continue;
            keep[i] = 0;
            dropped++;
          }
        }
      }
    }
  }
  return dropped;
}

// A9: component rule. Small free-standing groups of kept lines are not walls.
function componentRule(
  segs: Float64Array,
  n: number,
  keep: Uint8Array,
  bounds: readonly [number, number, number, number],
  mm: number,
  P: RoomDetectionParams,
): { dropped: number; limMm: number } {
  const pxMm = 50;
  const R = rasterizeKept(segs, n, keep, bounds, pxMm, mm);
  const { w, h, mask } = R;
  // Pixels within distance 1 px of a line pixel (the pixel itself and its 4 neighbours).
  const closed = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (mask[p] || (x > 0 && mask[p - 1]) || (x < w - 1 && mask[p + 1]) || (y > 0 && mask[p - w]) || (y < h - 1 && mask[p + w])) closed[p] = 1;
    }
  }
  const { label, comps } = labelComponents(closed, w, h);
  let ext = 0;
  for (const c of comps) ext = Math.max(ext, Math.hypot(c.maxx - c.minx, c.maxy - c.miny) * pxMm);
  const lim = Math.max(P.minCompMm, P.compFrac * ext);
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    const mx = ((segs[i * S]! + segs[i * S + 2]!) / 2 - R.x0) * R.s;
    const my = ((segs[i * S + 1]! + segs[i * S + 3]!) / 2 - R.y0) * R.s;
    const px = Math.min(w - 1, Math.max(0, Math.round(mx)));
    const py = Math.min(h - 1, Math.max(0, Math.round(my)));
    const id = label[py * w + px]!;
    if (id < 0) continue;
    const c = comps[id]!;
    if (Math.hypot(c.maxx - c.minx, c.maxy - c.miny) * pxMm < lim) {
      keep[i] = 0;
      dropped++;
    }
  }
  return { dropped, limMm: lim };
}

/**
 * Decides which segments are wall lines. `mmPerPt` is the real-world size of
 * one page point in millimetres (1 / calibration.pageUnitsPerRealUnit when the
 * calibration unit is mm). Returns one keep flag per segment.
 */
export function filterWallSegments(
  input: WallCandidateSegments,
  mmPerPt: number,
  params: Partial<RoomDetectionParams> = {},
): WallFilterResult {
  const P: RoomDetectionParams = { ...DEFAULT_ROOM_DETECTION_PARAMS, ...params };
  const segs = input.segments;
  const n = input.segmentCount;
  const mm = mmPerPt;
  const keep = new Uint8Array(n);
  const reason = new Uint8Array(n);
  for (let i = 0; i < n; i++) reason[i] = isLineKind(segs[i * S + SEG_KIND]!) ? REJECT_REASON.shortOrNotLine : REJECT_REASON.unpairedCurve;
  const stats: WallFilterStats = {
    kept: 0,
    stubsKept: 0,
    chords: 0,
    chordsPaired: 0,
    loopDropped: 0,
    loopBridged: 0,
    stairDropped: 0,
    dashDropped: 0,
    doorDropped: 0,
    compDropped: 0,
    compLimMm: 0,
  };
  const markRejected = (code: number): void => {
    for (let i = 0; i < n; i++) if (reason[i] === REJECT_REASON.kept && !keep[i]) reason[i] = code;
  };

  const pr = pairRule(segs, n, mm, P, P.hatchEvidence);
  let rej: Set<number> | null = null;
  if (P.hatchEvidence) {
    const { hs, okp } = hatchEvidenceScan(segs, n, mm, P, pr);
    const r = hatchReject(segs, mm, P, pr, hs, okp);
    rej = r.rej;
    stats.hatchShare = +r.share.toFixed(2);
    stats.hatchRejected = r.rej.size;
  }
  const longIds: number[] = [];
  const stubIds: number[] = [];
  for (let j = 0; j < pr.cand.length; j++) {
    const ci = pr.cand[j]!;
    if (!pr.tagged[j]) {
      reason[ci] = REJECT_REASON.noPartner;
      continue;
    }
    if (rej && rej.has(j)) {
      reason[ci] = REJECT_REASON.noHatchEvidence;
      continue;
    }
    if (pr.partners[j]! >= P.hatchPartners && pr.len[j]! * mm < P.hatchMaxLenMm) {
      reason[ci] = REJECT_REASON.hatch;
      continue;
    }
    if (pr.len[j]! * mm >= P.minLenMm) longIds.push(ci);
    else {
      stubIds.push(ci);
      reason[ci] = REJECT_REASON.stubUntouched;
    }
  }
  for (const i of longIds) {
    keep[i] = 1;
    reason[i] = REJECT_REASON.kept;
  }
  const stubOk = stubTouch(segs, longIds, stubIds, mm, P.stubTouchMm);
  for (const i of stubOk) {
    keep[i] = 1;
    reason[i] = REJECT_REASON.kept;
  }
  stats.stubsKept = stubOk.length;

  const cr = curveRule(segs, n, mm, P);
  for (let i = 0; i < n; i++) {
    if (cr.keep[i]) {
      keep[i] = 1;
      reason[i] = REJECT_REASON.kept;
    }
  }
  stats.chords = cr.nChords;
  stats.chordsPaired = cr.nTagged;

  const lr = loopRule(segs, n, keep, reason, mm, P);
  markRejected(REJECT_REASON.loop);
  stats.loopDropped = lr.dropped;
  stats.loopBridged = lr.bridged;

  if (P.stairMinSteps > 0) {
    stats.stairDropped = stairRule(segs, n, keep, mm, P);
    markRejected(REJECT_REASON.stair);
  }
  stats.dashDropped = dashRule(segs, n, keep, mm, P);
  markRejected(REJECT_REASON.dash);
  if (P.doorMinRadiusMm > 0) {
    stats.doorDropped = doorRule(segs, n, keep, mm, P);
    markRejected(REJECT_REASON.door);
  }
  const cp = componentRule(segs, n, keep, input.bounds ?? segmentBounds(segs, n), mm, P);
  markRejected(REJECT_REASON.component);
  stats.compDropped = cp.dropped;
  stats.compLimMm = Math.round(cp.limMm);
  let kept = 0;
  for (let i = 0; i < n; i++) kept += keep[i]!;
  stats.kept = kept;
  return { keep, reason, stats };
}
