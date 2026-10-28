// Extracts the hand route of the user from the route PDF into a local, git-ignored JSON fixture.
// Usage: node .claude/roadmap/tools/p2/extract-manual.mjs [pdf path]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const require = createRequire(path.join(repo, 'packages/pdf-engine-mupdf/package.json'));
const mupdf = await import(require.resolve('mupdf'));

const pdfPath = process.argv[2] ?? path.join(repo, 'fixtures/pdfs/00_arch_ground_floor_w_rooms_route_manual.pdf');
const outPath = path.join(repo, 'packages/core/fixtures/route-area/local/w-rooms-manual.json');
const PAGE_INDEX = 0;
const MAIN_RGB = '33,150,243';
const ROOM_RGB = '255,0,0';

const pdfBytes = fs.readFileSync(pdfPath);
const doc = mupdf.Document.openDocument(pdfBytes, 'application/pdf');
const pdf = doc.asPDF();
const names = pdf.getTrailer().get('Root').get('Names').get('EmbeddedFiles').get('Names');
const project = JSON.parse(names.get(1).get('EF').get('F').readStream().asString());

const calibration = project.calibrations?.[String(PAGE_INDEX)];
if (!calibration) throw new Error(`no calibration for page ${PAGE_INDEX}`);
const mmPerPt = 1 / calibration.pageUnitsPerRealUnit;
const networkTypeId = project.networkTypes?.[0]?.id;
if (!networkTypeId) throw new Error('no network type in the project');

const units = project.stamps.filter((s) => s.category === 'equipment');
if (units.length !== 1) throw new Error(`expected one equipment stamp, found ${units.length}`);
const unit = units[0];
const startStampId = unit.id;
const startPortId = unit.ports[0].id;
const terminals = project.stamps.filter((s) => s.category === 'terminal');

function portWorld(stamp, port) {
  const t = stamp.transform;
  const lx = (port.fractionX - 0.5) * stamp.nativeWidth * t.scale.x;
  const ly = (port.fractionY - 0.5) * stamp.nativeHeight * t.scale.y;
  const a = (t.rotationDegrees * Math.PI) / 180;
  return {
    x: t.position.x + lx * Math.cos(a) - ly * Math.sin(a),
    y: t.position.y + lx * Math.sin(a) + ly * Math.cos(a),
  };
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function inRing(ring, p) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function smallestRoomAt(p) {
  let best = null;
  for (const room of project.rooms) {
    if (room.pageIndex !== PAGE_INDEX || !inRing(room.polygon.outer, p)) continue;
    if (best === null || ringArea(room.polygon.outer) < ringArea(best.polygon.outer)) best = room;
  }
  return best;
}

const servedRoomIds = new Set();
for (const stamp of terminals) {
  for (const port of stamp.ports) {
    const room = smallestRoomAt(portWorld(stamp, port));
    if (room) servedRoomIds.add(room.id);
  }
}

const strokes = { main: [], room: [] };
const dev = new mupdf.Device({
  strokePath(path, stroke, ctm, cs, color) {
    const key = color.map((v) => Math.round(v * 255)).join(',');
    const group = key === MAIN_RGB ? strokes.main : key === ROOM_RGB ? strokes.room : null;
    if (!group) return;
    const points = [];
    path.walk({
      moveTo(x, y) { points.push({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] }); },
      lineTo(x, y) { points.push({ x: ctm[0] * x + ctm[2] * y + ctm[4], y: ctm[1] * x + ctm[3] * y + ctm[5] }); },
      curveTo() {},
      closePath() {},
    });
    group.push(points);
  },
});
const page = doc.loadPage(PAGE_INDEX);
page.run(dev, mupdf.Matrix.identity);
dev.close();

const out = {
  source: path.basename(pdfPath),
  mmPerPt,
  pageIndex: PAGE_INDEX,
  rooms: project.rooms,
  networkTypeId,
  startStampId,
  startPortId,
  stamps: project.stamps,
  manual: strokes,
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));

console.log(`main strokes: ${strokes.main.length}`);
console.log(`room strokes: ${strokes.room.length}`);
console.log(`terminals: ${terminals.length}`);
console.log(`served rooms: ${servedRoomIds.size}`);
console.log(`unit: ${startStampId} port ${startPortId}`);
console.log(`wrote: ${outPath}`);
