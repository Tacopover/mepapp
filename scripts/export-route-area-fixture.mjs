// Exports the rooms of a fixture PDF (page 0) as a fixture for the route-area tests.
// The rooms come from label-driven detection (core's detectLabelledRoomsOnPage), with the steps of scripts/room-labelled.mjs.
// Default: fixtures/pdfs/01_arch_first_floor.pdf at scale 50, written to packages/core/fixtures/route-area/first-floor-rooms.json.
// Needs `pnpm build` first.
//
//   node scripts/export-route-area-fixture.mjs [--source <file.pdf>] [--scale <N>] [--out <path>] [--pdf-dir <dir>]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MupdfEngine } from '../packages/pdf-engine-mupdf/dist/index.js';
import { detectLabelledRoomsOnPage, matchRoomType, polygonAreaPt2, readRoomLabels, ROOM_TYPE_LIBRARY } from '../packages/core/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SOURCE = opt('--source') ?? '01_arch_first_floor.pdf';
const SCALE = opt('--scale') !== undefined ? Number(opt('--scale')) : 50;
const OUT = opt('--out') !== undefined ? resolve(opt('--out')) : join(ROOT, 'packages', 'core', 'fixtures', 'route-area', 'first-floor-rooms.json');
const PDF_DIR = opt('--pdf-dir') ?? join(ROOT, 'fixtures', 'pdfs');

const engine = new MupdfEngine();
const doc = await engine.openDocument(new Uint8Array(readFileSync(join(PDF_DIR, SOURCE))));
const pi = doc.getPageInfo(0);
const swap = pi.rotationDegrees === 90 || pi.rotationDegrees === 270;
const bounds = [0, 0, swap ? pi.heightPt : pi.widthPt, swap ? pi.widthPt : pi.heightPt];
const labels = readRoomLabels(await doc.getTextRuns(0)).filter((l) => l.name !== null);
const data = await doc.getVectorPaths(0);
const mmPerPt = (25.4 / 72) * SCALE;
const result = detectLabelledRoomsOnPage(
  { segments: data.segments, segmentCount: data.segmentCount, bounds },
  labels.map((l) => ({ anchor: l.anchor, printedM2: l.areaM2, bounds: l.bounds })),
  mmPerPt,
  {},
);

const rooms = result.rooms.map((lr, k) => {
  const label = labels[lr.target];
  const roomTypeId = matchRoomType(label.name, label.details, ROOM_TYPE_LIBRARY)?.id;
  return {
    id: `room-${k}`,
    pageIndex: 0,
    polygon: lr.polygon,
    name: label.name,
    number: label.number,
    source: 'detected',
    locked: false,
    open: lr.open,
    ...(label.details.length > 0 ? { details: label.details } : {}),
    ...(roomTypeId !== undefined ? { roomTypeId, roomTypeSource: 'matched' } : {}),
  };
});

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ source: SOURCE, scale: SCALE, mmPerPt, pageIndex: 0, rooms }));
console.log(`rooms: ${rooms.length}`);
console.log(`corridor rooms: ${rooms.filter((r) => r.roomTypeId === 'corridor').length}`);
const ratios = result.rooms
  .filter((lr) => labels[lr.target].areaM2 !== null)
  .map((lr) => (polygonAreaPt2(lr.polygon) * mmPerPt * mmPerPt) / 1e6 / labels[lr.target].areaM2)
  .sort((a, b) => a - b);
const mid = Math.floor(ratios.length / 2);
const median = ratios.length % 2 === 1 ? ratios[mid] : (ratios[mid - 1] + ratios[mid]) / 2;
console.log(`median area ratio (polygon m2 / printed m2): ${median.toFixed(3)}`);
