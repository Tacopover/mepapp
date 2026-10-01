// On-demand check of label-driven room detection (Detect rooms in the app, core's detectLabelledRooms).
// For every fixture PDF in scripts/room-regression-rooms.json that has room labels in its text, it reads the
// labels with a name (as SketchScene.detectRooms does), detects the rooms and counts the rooms whose area is
// within 15 % (and 30 %) of the printed area. A room counts only when its polygon holds its label: a room in the
// wrong place with the right area is not a hit. Files that are absent are skipped. Needs `pnpm build` first.
//
//   pnpm room-labelled [--file 00_arch_ground_floor] [--params '{"gapMm":700}'] [--rooms]   (--rooms lists every label)
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MupdfEngine } from '../packages/pdf-engine-mupdf/dist/index.js';
import { detectLabelledRoomsOnPage, polygonContainsPoint, readRoomLabels } from '../packages/core/dist/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const params = opt('--params') ? JSON.parse(opt('--params')) : {};
const only = opt('--file');
const listRooms = args.includes('--rooms');
const rooms = JSON.parse(readFileSync(join(ROOT, 'scripts', 'room-regression-rooms.json'), 'utf8'));
const engine = new MupdfEngine();
const totals = { labels: 0, withArea: 0, within15: 0, within30: 0, missing: 0, open: 0, misplaced: 0 };

for (const [file, info] of Object.entries(rooms.files)) {
  if (only && file !== only) continue;
  const path = join(ROOT, 'fixtures', 'pdfs', file + '.pdf');
  if (!existsSync(path)) continue;
  const doc = await engine.openDocument(new Uint8Array(readFileSync(path)));
  const pi = doc.getPageInfo(0);
  const swap = pi.rotationDegrees === 90 || pi.rotationDegrees === 270;
  const bounds = [0, 0, swap ? pi.heightPt : pi.widthPt, swap ? pi.widthPt : pi.heightPt];
  const labels = readRoomLabels(await doc.getTextRuns(0)).filter((l) => l.name !== null);
  if (labels.length === 0) {
    console.log(`${file.padEnd(22)} no room labels in the text, skipped`);
    continue;
  }
  const data = await doc.getVectorPaths(0);
  const mmPerPt = (25.4 / 72) * info.scale;
  const t0 = performance.now();
  const res = detectLabelledRoomsOnPage(
    { segments: data.segments, segmentCount: data.segmentCount, bounds },
    labels.map((l) => ({ anchor: l.anchor, printedM2: l.areaM2, bounds: l.bounds })),
    mmPerPt,
    params,
  );
  const ms = performance.now() - t0;
  const withArea = labels.filter((l) => l.areaM2 !== null).length;
  const atLabel = (r) => polygonContainsPoint(r.polygon, labels[r.target].anchor);
  const dev = res.rooms.filter((r) => r.deviation !== null && atLabel(r)).map((r) => Math.abs(r.deviation));
  const misplaced = res.rooms.filter((r) => !atLabel(r)).length;
  const row = {
    labels: labels.length,
    withArea,
    within15: dev.filter((d) => d <= 0.15).length,
    within30: dev.filter((d) => d <= 0.3).length,
    missing: labels.length - res.rooms.length,
    open: res.rooms.filter((r) => r.open).length,
    misplaced,
  };
  for (const k of Object.keys(totals)) totals[k] += row[k];
  if (listRooms) {
    const byTarget = new Map(res.rooms.map((r) => [r.target, r]));
    labels.forEach((l, t) => {
      const r = byTarget.get(t);
      const name = `${l.number ?? ''} ${l.name}`.trim();
      console.log(`  ${file} ${name.padEnd(34)} printed ${String(l.areaM2 ?? '-').padStart(5)}  ${r ? `area ${r.areaM2.toFixed(1).padStart(6)}  dev ${r.deviation === null ? '   -' : ((r.deviation * 100).toFixed(0) + '%').padStart(5)}  ${r.method}${r.open ? ' open' : ''}${atLabel(r) ? '' : ' NOT-AT-LABEL'}` : 'no room'}`);
    });
  }
  console.log(
    `${file.padEnd(22)} within 15 %: ${String(row.within15).padStart(3)} / ${withArea}  within 30 %: ${String(row.within30).padStart(3)}  labels without room: ${row.missing}  open: ${row.open}  not at label: ${row.misplaced}  ${(ms / 1000).toFixed(1)} s`,
  );
}
console.log(`${'total'.padEnd(22)} within 15 %: ${String(totals.within15).padStart(3)} / ${totals.withArea}  within 30 %: ${String(totals.within30).padStart(3)}  labels without room: ${totals.missing}  open: ${totals.open}  not at label: ${totals.misplaced}`);
