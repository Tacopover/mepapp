// On-demand regression check for room detection (packages/core/src/rooms).
// Reads every PDF listed in scripts/room-regression-rooms.json from
// fixtures/pdfs/ through the built pdf-engine-mupdf adapter, runs the core
// wall filter and click-to-fill on the study rooms, and prints the area of each
// room against the area printed in the drawing. Files that are absent are
// skipped. Needs `pnpm build` first.
//
//   pnpm room-regression                       default parameters
//   pnpm room-regression --grow 100            wallGrowMm=100 (study value)
//   pnpm room-regression --params '{"gapMm":700}' --file 00_arch_ground_floor
//   pnpm room-regression --overlay <dir>       write polygon overlay PNGs (pngjs is not a repo dependency:
//                                              set PNGJS_FROM to a file next to a node_modules that has it)
//
// The room list (seed points, label areas, OPEN flags) was copied from the
// prototype driver run.mjs. OPEN rooms have no closed wall in the drawing and
// are excluded from the metric.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MupdfEngine } from '../packages/pdf-engine-mupdf/dist/index.js';
import { filterWallSegments, fillRoomAt } from '../packages/core/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const params = { ...(opt('--params') ? JSON.parse(opt('--params')) : {}) };
if (opt('--grow') !== undefined) params.wallGrowMm = Number(opt('--grow'));
const only = opt('--file');
const overlayDir = opt('--overlay');

const rooms = JSON.parse(readFileSync(join(ROOT, 'scripts', 'room-regression-rooms.json'), 'utf8'));
const engine = new MupdfEngine();
const rows = [];
const filterMs = {};

for (const [file, info] of Object.entries(rooms.files)) {
  if (only && file !== only) continue;
  const path = join(ROOT, 'fixtures', 'pdfs', `${file}.pdf`);
  if (!existsSync(path)) {
    console.log(`skip ${file}: ${path} not found`);
    continue;
  }
  const doc = await engine.openDocument(new Uint8Array(readFileSync(path)));
  const pi = doc.getPageInfo(0);
  const swap = pi.rotationDegrees === 90 || pi.rotationDegrees === 270;
  const bounds = [0, 0, swap ? pi.heightPt : pi.widthPt, swap ? pi.widthPt : pi.heightPt];
  const data = await doc.getVectorPaths(0);
  const input = { segments: data.segments, segmentCount: data.segmentCount, bounds };
  const mmPerPt = (25.4 / 72) * info.scale;
  const t0 = performance.now();
  const filt = filterWallSegments(input, mmPerPt, params);
  filterMs[file] = Math.round(performance.now() - t0);
  const walls = { walls: input, keep: filt.keep };
  for (const room of info.rooms) {
    const t1 = performance.now();
    const res = fillRoomAt(walls, { x: room.x, y: room.y }, mmPerPt, { ...params, labelAreaM2: room.labelAreaM2 });
    const ms = Math.round(performance.now() - t1);
    rows.push({ file, room, res, ms, ratio: res.areaM2 / room.labelAreaM2, pixRatio: res.pixelAreaM2 / room.labelAreaM2 });
    if (overlayDir) await writeOverlay(overlayDir, file, room, input, filt.keep, res, mmPerPt);
  }
}

const line = (r) =>
  `${r.room.id.padEnd(26)} label ${String(r.room.labelAreaM2).padStart(6)}  poly ${r.res.areaM2.toFixed(2).padStart(8)}  pix ${r.res.pixelAreaM2.toFixed(2).padStart(8)}  ratio ${r.ratio.toFixed(2)}  verts ${String(r.res.polygon.outer.length).padStart(4)} holes ${r.res.polygon.holes.length}  open=${r.res.flags.open ? 1 : 0} border=${r.res.flags.touchesRoiBorder ? 1 : 0}  ${r.ms} ms${r.room.open ? '  (OPEN in drawing)' : ''}`;
for (const r of rows) console.log(line(r));

const main = rows.filter((r) => !r.room.extra);
const non = main.filter((r) => !r.room.open);
const within = (r) => Math.abs(r.ratio - 1) <= 0.15;
const errs = non.map((r) => Math.abs(r.ratio - 1)).sort((a, b) => a - b);
const extra = rows.filter((r) => r.room.extra);
const openRooms = main.filter((r) => r.room.open);
console.log('');
console.log(`params: ${JSON.stringify(params)}`);
console.log(`nonOPEN within15: ${non.filter(within).length} of ${non.length} | median abs err: ${errs.length ? errs[errs.length >> 1].toFixed(3) : 'n/a'}`);
console.log(`extra5 within15: ${extra.filter(within).length} of ${extra.length}`);
console.log(`OPEN rooms flagged open: ${openRooms.filter((r) => r.res.flags.open).length} of ${openRooms.length}; non-OPEN rooms flagged open: ${non.filter((r) => r.res.flags.open).length} of ${non.length}`);
console.log(`filter ms: ${JSON.stringify(filterMs)}`);
console.log(`fill ms: median ${median(rows.map((r) => r.ms))}, max ${Math.max(0, ...rows.map((r) => r.ms))}`);

function median(a) {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
}

// Overlay: kept walls (black) and removed candidate lines (pink) in a crop around the room, polygon in blue.
async function writeOverlay(dir, file, room, input, keep, res, mmPerPt) {
  const { createRequire } = await import('node:module');
  const { PNG } = createRequire(process.env.PNGJS_FROM ?? import.meta.url)('pngjs');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync(dir, { recursive: true });
  const poly = res.polygon.outer;
  if (!poly.length) return;
  const pad = 40;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const s = Math.min(6, 1400 / Math.max(x1 - x0, y1 - y0));
  const w = Math.ceil((x1 - x0) * s), h = Math.ceil((y1 - y0) * s);
  const png = new PNG({ width: w, height: h });
  png.data.fill(255);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const o = (y * w + x) * 4;
    png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
  };
  const line = (ax, ay, bx, by, r, g, b, thick = 0) => {
    const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))) + 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + ((bx - ax) * i) / n), y = Math.round(ay + ((by - ay) * i) / n);
      for (let dx = -thick; dx <= thick; dx++) for (let dy = -thick; dy <= thick; dy++) put(x + dx, y + dy, r, g, b);
    }
  };
  const seg = input.segments;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < input.segmentCount; i++) {
      const kept = keep[i] === 1;
      if ((pass === 0) === kept) continue;
      const o = i * 8;
      if ((seg[o + 6] & 3) > 1 && !kept) continue;
      const ax = (seg[o] - x0) * s, ay = (seg[o + 1] - y0) * s, bx = (seg[o + 2] - x0) * s, by = (seg[o + 3] - y0) * s;
      if (Math.max(ax, bx) < 0 || Math.min(ax, bx) > w || Math.max(ay, by) < 0 || Math.min(ay, by) > h) continue;
      if (kept) line(ax, ay, bx, by, 0, 0, 0); else line(ax, ay, bx, by, 255, 190, 190);
    }
  }
  const ring = (pts, r, g, b) => {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      line((p.x - x0) * s, (p.y - y0) * s, (q.x - x0) * s, (q.y - y0) * s, r, g, b, 1);
    }
  };
  ring(poly, 20, 80, 230);
  for (const hole of res.polygon.holes) ring(hole, 230, 80, 20);
  for (let d = -4; d <= 4; d++) { put(Math.round((res.seedPt.x - x0) * s) + d, Math.round((res.seedPt.y - y0) * s), 0, 190, 0); put(Math.round((res.seedPt.x - x0) * s), Math.round((res.seedPt.y - y0) * s) + d, 0, 190, 0); }
  writeFileSync(join(dir, `${room.id.replace('#', '_')}.png`), PNG.sync.write(png));
}
