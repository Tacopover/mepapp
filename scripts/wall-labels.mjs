// On-demand score of the wall filter (packages/core/src/rooms/filter.ts) against lines that the user labelled
// with the wall-line debug overlay (Menu, Show wall lines; W = should be a wall, N = should not be a wall).
// The labels are the copied overlay text in scripts/wall-labels.txt, one line each:
//   <file> P1-L<segment index> expected=wall|not-wall note="..." | now: ..., (x0, y0) -> (x1, y1) pt
// The scale of each file comes from scripts/room-regression-rooms.json. A label whose coordinates do not match
// the extracted segment is reported as a mismatch (the extraction changed). A non-wall that the filter keeps is
// "connected" when one of its end points lies within 100 mm of another kept line that runs in another
// direction (it can close a room outline), else "isolated" (it lies inside a room and does little harm).
// Files that are absent are skipped. Needs `pnpm build` first.
//
//   pnpm wall-labels [--params '{"stairMaxPitchMm":450}'] [--all]     (--all also lists the correct lines)
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MupdfEngine } from '../packages/pdf-engine-mupdf/dist/index.js';
import { filterWallSegments, REJECT_REASON } from '../packages/core/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const params = opt('--params') ? JSON.parse(opt('--params')) : {};
const listAll = args.includes('--all');
const TOUCH_MM = 100;
const REASON = Object.fromEntries(Object.entries(REJECT_REASON).map(([k, v]) => [v, k]));
const scales = JSON.parse(readFileSync(join(ROOT, 'scripts', 'room-regression-rooms.json'), 'utf8')).files;
const labels = readFileSync(join(ROOT, 'scripts', 'wall-labels.txt'), 'utf8')
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => {
    const m = /^(\S+) P1-L(\d+) expected=(\S+)(?: note="([^"]*)")? \|.*\(([-\d.]+), ([-\d.]+)\) -> \(([-\d.]+), ([-\d.]+)\) pt$/.exec(l);
    if (!m) throw new Error('Cannot read label line: ' + l);
    return { file: m[1], i: Number(m[2]), wall: m[3] === 'wall', note: m[4] ?? '', xy: m.slice(5, 9).map(Number) };
  });

const engine = new MupdfEngine();
const pages = new Map();
async function page(file) {
  if (pages.has(file)) return pages.get(file);
  const path = join(ROOT, 'fixtures', 'pdfs', file);
  const scale = scales[file.replace(/\.pdf$/, '')]?.scale;
  let value = null;
  if (existsSync(path) && scale) {
    const doc = await engine.openDocument(new Uint8Array(readFileSync(path)));
    const pi = doc.getPageInfo(0);
    const swap = pi.rotationDegrees === 90 || pi.rotationDegrees === 270;
    const bounds = [0, 0, swap ? pi.heightPt : pi.widthPt, swap ? pi.widthPt : pi.heightPt];
    const data = await doc.getVectorPaths(0);
    const mm = (25.4 / 72) * scale;
    const { keep, reason } = filterWallSegments({ segments: data.segments, segmentCount: data.segmentCount, bounds }, mm, params);
    value = { s: data.segments, n: data.segmentCount, mm, keep, reason };
  }
  pages.set(file, value);
  return value;
}

const pointSegDist = (px, py, s, j) => {
  const ax = s[j * 8], ay = s[j * 8 + 1], dx = s[j * 8 + 2] - ax, dy = s[j * 8 + 3] - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
};

/** Distance in mm from the end points of line i to the nearest other kept line that runs at least 20 degrees off. */
function nearestCrossingMm(p, i) {
  const { s, n, mm, keep } = p;
  const ux = s[i * 8 + 2] - s[i * 8], uy = s[i * 8 + 3] - s[i * 8 + 1];
  const ul = Math.hypot(ux, uy);
  let best = Infinity;
  for (let j = 0; j < n; j++) {
    if (j === i || !keep[j]) continue;
    const vx = s[j * 8 + 2] - s[j * 8], vy = s[j * 8 + 3] - s[j * 8 + 1];
    const vl = Math.hypot(vx, vy);
    if (vl === 0 || Math.abs(ux * vy - uy * vx) / (ul * vl) < Math.sin((20 * Math.PI) / 180)) continue;
    best = Math.min(best, pointSegDist(s[i * 8], s[i * 8 + 1], s, j), pointSegDist(s[i * 8 + 2], s[i * 8 + 3], s, j));
  }
  return best * mm;
}

const count = { ok: 0, wallDropped: 0, keptConnected: 0, keptIsolated: 0, mismatch: 0, skipped: 0 };
for (const lab of labels) {
  const p = await page(lab.file);
  const tag = `${lab.file} L${lab.i} expected=${lab.wall ? 'wall' : 'not-wall'} "${lab.note}"`;
  if (!p) {
    count.skipped++;
    continue;
  }
  const o = lab.i * 8;
  if (lab.i >= p.n || lab.xy.some((v, k) => Math.abs(p.s[o + k] - v) > 0.06)) {
    count.mismatch++;
    console.log(`MISMATCH  ${tag}: the segment has other coordinates now`);
    continue;
  }
  const kept = p.keep[lab.i] === 1;
  const reason = REASON[p.reason[lab.i]];
  if (kept === lab.wall) {
    count.ok++;
    if (listAll) console.log(`ok        ${tag}: ${reason}`);
  } else if (lab.wall) {
    count.wallDropped++;
    console.log(`WRONG     ${tag}: dropped (${reason})`);
  } else {
    const d = nearestCrossingMm(p, lab.i);
    const connected = d <= TOUCH_MM;
    count[connected ? 'keptConnected' : 'keptIsolated']++;
    console.log(`WRONG     ${tag}: kept, ${connected ? 'connected' : 'isolated'} (nearest crossing kept line ${Number.isFinite(d) ? Math.round(d) + ' mm' : 'none'})`);
  }
}
const scored = labels.length - count.skipped - count.mismatch;
console.log(
  `\nscore ${count.ok} / ${scored} correct; walls dropped ${count.wallDropped}; non-walls kept ${count.keptConnected + count.keptIsolated} (connected ${count.keptConnected}, isolated ${count.keptIsolated})` +
    (count.mismatch ? `; ${count.mismatch} mismatched` : '') +
    (count.skipped ? `; ${count.skipped} skipped (file absent)` : ''),
);
