// On-demand check of detect-all (packages/core/src/rooms/detect-all.ts).
// For every fixture PDF in scripts/room-regression-rooms.json it detects all
// rooms on page 1 and, for each study room, prints the area of the detected
// room that contains the study seed next to the click-to-fill area and the
// label area. Files that are absent are skipped. Needs `pnpm build` first.
//
//   pnpm room-detect-all [--file 00_arch_ground_floor] [--params '{"gapMm":700}']
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MupdfEngine } from '../packages/pdf-engine-mupdf/dist/index.js';
import { filterWallSegments, fillRoomAt, detectAllRooms, pointInRing } from '../packages/core/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const params = opt('--params') ? JSON.parse(opt('--params')) : {};
const only = opt('--file');
const rooms = JSON.parse(readFileSync(join(ROOT, 'scripts', 'room-regression-rooms.json'), 'utf8'));
const engine = new MupdfEngine();
let found = 0;
let within = 0;
let total = 0;

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
  const filt = filterWallSegments(input, mmPerPt, params);
  const walls = { walls: input, keep: filt.keep };
  const t0 = performance.now();
  const res = detectAllRooms(walls, mmPerPt, params, opt('--min') ? { minRoomM2: Number(opt('--min')) } : {});
  const ms = Math.round(performance.now() - t0);
  const totalArea = res.rooms.reduce((s, r) => s + r.areaM2, 0);
  console.log(`\n== ${file}: ${res.rooms.length} rooms (${totalArea.toFixed(0)} m2), ${res.leaks.length} leak regions, ${res.componentsDropped} dropped, pxMm ${res.pxMm.toFixed(1)}, ${ms} ms`);
  for (const room of info.rooms) {
    const hit = res.rooms.find((r) => pointInRing(room.x, room.y, r.polygon.outer.flatMap((p) => [p.x, p.y])) && !r.polygon.holes.some((h) => pointInRing(room.x, room.y, h.flatMap((p) => [p.x, p.y]))));
    const click = fillRoomAt(walls, { x: room.x, y: room.y }, mmPerPt, params);
    const a = hit ? hit.areaM2 : NaN;
    const inLeak = res.leaks.some((l) => room.x >= l.bounds[0] && room.x <= l.bounds[2] && room.y >= l.bounds[1] && room.y <= l.bounds[3]);
    const fmt = (v) => (Number.isFinite(v) ? v.toFixed(2).padStart(8) : '     n/a');
    console.log(`${room.id.padEnd(26)} label ${String(room.labelAreaM2).padStart(6)}  all ${fmt(a)}  click ${fmt(click.areaM2)}  ${hit ? '' : inLeak ? 'in leak region' : 'no room'}${room.open ? '  (OPEN)' : ''}`);
    if (!room.open && !room.extra) {
      total++;
      if (hit) found++;
      if (hit && Math.abs(a / room.labelAreaM2 - 1) <= 0.15) within++;
    }
  }
}
console.log(`\nnon-OPEN main rooms: found ${found} of ${total}, within 15%: ${within}`);
