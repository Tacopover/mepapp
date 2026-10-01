// Dev-time export: cropped windows of the tracked fixture 00_arch_ground_floor.pdf
// around a few rooms, as compact binary files for the room detection tests in
// packages/core (which cannot import mupdf). Uses the built pdf-engine-mupdf
// adapter, so run `pnpm build` first. Output: packages/core/fixtures/rooms/.
//
//   node scripts/export-room-fixtures.mjs
//
// Binary layout of <name>.f32: little-endian Float32, 8 numbers per segment,
// same layout as VectorPageData.segments in packages/pdf-engine. Float32 keeps
// coordinates within 0.0002 pt (0.004 mm at 1:50): the script prints the
// largest error. A segment is included when its bounding box meets the window;
// segments are not cut at the window edge.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MupdfEngine } from '../packages/pdf-engine-mupdf/dist/index.js';
import { filterWallSegments } from '../packages/core/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages', 'core', 'fixtures', 'rooms');
const FILE = '00_arch_ground_floor';
const SCALE = 50; // drawing scale 1:50
const HALF = 300; // window half size in pt (5.3 m)

// Seeds and label areas are the study rooms of scripts/room-regression-rooms.json.
const wanted = ['#2', '#3', '#x2', '#x1'];
const study = JSON.parse(readFileSync(join(ROOT, 'scripts', 'room-regression-rooms.json'), 'utf8')).files[FILE];

const engine = new MupdfEngine();
const doc = await engine.openDocument(new Uint8Array(readFileSync(join(ROOT, 'fixtures', 'pdfs', `${FILE}.pdf`))));
const data = await doc.getVectorPaths(0);
const segs = data.segments;
mkdirSync(OUT, { recursive: true });

// The wall filter drops free-standing components smaller than 5 % of the largest one. A window has a
// smaller largest component than the page, so the tests pass the limit of the full page instead.
const pi = doc.getPageInfo(0);
const full = filterWallSegments({ segments: segs, segmentCount: data.segmentCount, bounds: [0, 0, pi.widthPt, pi.heightPt] }, (25.4 / 72) * SCALE);
const index = { source: `${FILE}.pdf (fixtures/pdfs)`, scale: SCALE, minCompMm: full.stats.compLimMm, rooms: [] };
let maxErr = 0;
let totalBytes = 0;
for (const suffix of wanted) {
  const room = study.rooms.find((r) => r.id === `${FILE}${suffix}`);
  const win = [room.x - HALF, room.y - HALF, room.x + HALF, room.y + HALF];
  const picked = [];
  for (let i = 0; i < data.segmentCount; i++) {
    const o = i * 8;
    if (Math.max(segs[o], segs[o + 2]) < win[0] || Math.min(segs[o], segs[o + 2]) > win[2]) continue;
    if (Math.max(segs[o + 1], segs[o + 3]) < win[1] || Math.min(segs[o + 1], segs[o + 3]) > win[3]) continue;
    picked.push(i);
  }
  const f32 = new Float32Array(picked.length * 8);
  picked.forEach((i, k) => {
    for (let c = 0; c < 8; c++) {
      f32[k * 8 + c] = segs[i * 8 + c];
      if (c < 4) maxErr = Math.max(maxErr, Math.abs(f32[k * 8 + c] - segs[i * 8 + c]));
    }
  });
  const name = `ground_floor_${room.id.split('#')[1]}`;
  writeFileSync(join(OUT, `${name}.f32`), Buffer.from(f32.buffer));
  totalBytes += f32.byteLength;
  index.rooms.push({ name, id: room.id, label: room.name, seed: { x: room.x, y: room.y }, labelAreaM2: room.labelAreaM2, bounds: win, segmentCount: picked.length, extra: room.extra });
  console.log(`${name}: ${picked.length} segments, ${(f32.byteLength / 1024).toFixed(0)} KiB`);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index, null, 1) + '\n');
console.log(`total ${(totalBytes / 1024).toFixed(0)} KiB, max Float32 coordinate error ${maxErr.toExponential(2)} pt`);

// Text lines of the whole page for the label reading tests (rooms/labels.test.ts).
const runs = await doc.getTextRuns(0);
const r2 = (v) => Math.round(v * 100) / 100;
writeFileSync(
  join(OUT, 'ground_floor_text.json'),
  JSON.stringify(runs.map((t) => ({ text: t.text, x: r2(t.x), y: r2(t.y), width: r2(t.width), height: r2(t.height), fontSizePt: r2(t.fontSizePt) }))) + '\n',
);
console.log(`text: ${runs.length} runs`);
