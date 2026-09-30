// On-demand check of room name reading (packages/core/src/rooms/labels.ts): detects all rooms of every fixture
// PDF in scripts/room-regression-rooms.json, reads the room labels from the PDF text and prints the name, number
// and label area chosen for each study room. Files that are absent are skipped. Needs `pnpm build` first.
//   pnpm room-labels [FILE]     (FILE also lists every label found)
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const R = join(dirname(fileURLToPath(import.meta.url)), '..');
const { MupdfEngine } = await import(R + '/packages/pdf-engine-mupdf/dist/index.js');
const { filterWallSegments, detectAllRooms, roomContainsPoint, roomFromFill, readRoomLabels, withRoomLabels, matchRoomLabels, roomAreaWarning } = await import(R + '/packages/core/dist/index.js');
const rooms = JSON.parse(readFileSync(R + '/scripts/room-regression-rooms.json', 'utf8'));
const engine = new MupdfEngine();
for (const [file, info] of Object.entries(rooms.files)) {
  const path = R + '/fixtures/pdfs/' + file + '.pdf';
  if (!existsSync(path)) continue;
  const doc = await engine.openDocument(new Uint8Array(readFileSync(path)));
  const pi = doc.getPageInfo(0);
  const swap = pi.rotationDegrees === 90 || pi.rotationDegrees === 270;
  const bounds = [0, 0, swap ? pi.heightPt : pi.widthPt, swap ? pi.widthPt : pi.heightPt];
  const data = await doc.getVectorPaths(0);
  const runs = await doc.getTextRuns(0);
  const input = { segments: data.segments, segmentCount: data.segmentCount, bounds };
  const mm = (25.4 / 72) * info.scale;
  const cal = { pageUnitsPerRealUnit: 1 / mm };
  const walls = { walls: input, keep: filterWallSegments(input, mm).keep };
  const res = detectAllRooms(walls, mm);
  const t0 = performance.now();
  const labels = readRoomLabels(runs);
  const inputs = res.rooms.map((r) => roomFromFill(r, 0, 'detected'));
  const named = withRoomLabels(inputs, labels, cal);
  const ms = performance.now() - t0;
  const matches = matchRoomLabels(inputs, labels, cal);
  const matchedLabels = new Set(matches.flatMap((m) => [m.label, ...m.others]));
  console.log(`\n== ${file}: ${runs.length} runs -> ${labels.length} labels (${labels.filter((l) => l.number).length} with number, ${labels.filter((l) => l.areaM2 !== null).length} with area); ${res.rooms.length} rooms, ${named.filter((r) => r.name || r.number).length} named; labels outside every room: ${labels.length - matchedLabels.size}; ${ms.toFixed(0)} ms`);
  for (const room of info.rooms) {
    const k = named.findIndex((r) => roomContainsPoint(r, { x: room.x, y: room.y }));
    if (k < 0) { console.log(`  ${room.id}: no room`); continue; }
    const r = named[k];
    const w = roomAreaWarning(r, cal);
    console.log(`  ${room.id.padEnd(26)} -> number=${r.number} name=${JSON.stringify(r.name)} label=${r.labelAreaM2} others=${JSON.stringify(r.otherLabels ?? [])}${w ? ` WARN ${(w.deviation * 100).toFixed(0)}%` : ''}`);
  }
  if (process.argv[2] === file) for (const l of labels) console.log('   L', JSON.stringify([l.number, l.code, l.name, l.areaM2]));
}
