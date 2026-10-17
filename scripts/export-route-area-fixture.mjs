// Exports the rooms of fixtures/pdfs/01_arch_first_floor.pdf (page 0) as a fixture for the route-area tests.
// The rooms come from label-driven detection (core's detectLabelledRoomsOnPage), with the steps of scripts/room-labelled.mjs.
// Writes packages/core/fixtures/route-area/first-floor-rooms.json. Needs `pnpm build` first.
//
//   node scripts/export-route-area-fixture.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MupdfEngine } from '../packages/pdf-engine-mupdf/dist/index.js';
import { detectLabelledRoomsOnPage, matchRoomType, readRoomLabels, ROOM_TYPE_LIBRARY } from '../packages/core/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = '01_arch_first_floor.pdf';
const SCALE = 50;
const OUT = join(ROOT, 'packages', 'core', 'fixtures', 'route-area', 'first-floor-rooms.json');

const engine = new MupdfEngine();
const doc = await engine.openDocument(new Uint8Array(readFileSync(join(ROOT, 'fixtures', 'pdfs', SOURCE))));
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
