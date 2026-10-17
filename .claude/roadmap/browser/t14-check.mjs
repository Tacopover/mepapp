// T14b: the scene API of the route area (list, flag, cache, layer, events, debounce). Scene API only: the menu item comes in T16.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/browser/t14-check.mjs
import { open, setupRooms, screenOf, clipPixels, colorPixelsIn, isPurple, isTeal, routeAreaView, baseline, sameAsBaseline } from './r4-lib.mjs';

const FIXTURES = '/root/MepApp/fixtures/pdfs/';
const PDF1 = FIXTURES + '01_arch_first_floor.pdf';
const PDF2 = FIXTURES + 'arch_simple_A4.pdf';

const t = await open();
const { page, check, idle } = t;
const ev = (fn, arg) => page.evaluate(fn, arg);
const { rooms, corridorIds, shaftId } = await setupRooms(t, { pdf: PDF1, scale: '50', shaft: true });
console.log(`setup: ${rooms.length} rooms, ${corridorIds.length} corridors, shaft ${shaftId}`);
check(corridorIds.length > 0 && shaftId !== null, 'setup: corridor rooms and a shaft room exist', `corridors ${corridorIds.length}, shaft ${shaftId}`);
const firstDocId = await ev(() => window.__mepSketchScene.getActiveDocumentId());
const base = await baseline(page);

// 8 (first call) and 1
const timing = await ev(() => {
  const t0 = performance.now();
  window.__mepSketchScene.getRouteArea();
  return performance.now() - t0;
});
console.log(`TIMING first getRouteArea(): ${timing.toFixed(0)} ms`);
check(timing < 1000, 'step 8: first getRouteArea() is under 1 s', `${timing.toFixed(0)} ms`);
if (timing >= 1000) console.log(`FINDING: first getRouteArea() took ${timing.toFixed(0)} ms (limit 1000 ms): propose the worker task`);
let view = await routeAreaView(page);
const expected = rooms.filter((r) => r.pageIndex === 0 && (r.roomTypeId === 'corridor' || r.roomTypeId === 'shaft')).map((r) => `${r.id}:${r.roomTypeId === 'shaft' ? 'shaft' : 'path'}`).sort();
const got = view.area.rooms.map((r) => `${r.roomId}:${r.kind}`).sort();
check(view.area.status === 'ok', 'step 1: status ok', view.area.status);
check(JSON.stringify(expected) === JSON.stringify(got), 'step 1: rooms are the corridor rooms and the shaft room', `${expected.length} expected, ${got.length} got`);
check(view.warnings.length > 0 && view.warnings[view.warnings.length - 1].code === 'draft-2d', 'step 1: warnings end with draft-2d', view.warnings.map((w) => w.code).join(','));
console.log(`area: ${view.area.rooms.length} rooms, ${view.area.nodes.length} nodes, ${view.area.edges.length} edges, ${view.area.entries.length} entries, ${view.area.parts} parts`);

// A point is "on the canvas" when it is inside the canvas with a margin (the page does not fit the view at 100 %).
const onCanvas = (p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return g.x > 60 && g.y > 60 && g.x < r.width - 60 && g.y < r.height - 60;
  }, p);

// 2
const visibleNodes = [];
for (const n of view.area.nodes) if (n.kind !== 'wall' && n.kind !== 'shaft' && (await onCanvas(n.point))) visibleNodes.push(n);
console.log(`nodes on the canvas: ${visibleNodes.length}`);
check(visibleNodes.length > 0, 'setup: a route node is on the canvas');
const node = visibleNodes.find((n) => n.kind === 'junction') ?? visibleNodes[0];
const nodeScreen = await screenOf(page, node.point);
check(!(await ev(() => window.__mepSketchScene.isRouteAreaVisible())), 'step 2: flag is false at first');
const off1 = await clipPixels(page, nodeScreen);
const tealOff = await colorPixelsIn(page, nodeScreen, isTeal);
const purpleOff = await colorPixelsIn(page, nodeScreen, isPurple);
check(tealOff === 0 && purpleOff === 0, 'step 2: no teal and no purple pixel with the flag off', `teal ${tealOff}, purple ${purpleOff}`);
await ev(() => window.__mepSketchScene.setRouteAreaVisible(true));
await idle(500);
const on1 = await clipPixels(page, nodeScreen);
const purpleOn = await colorPixelsIn(page, nodeScreen, isPurple);
check(purpleOn > 0, 'step 2: purple pixels with the flag on', `purple ${purpleOn}`);
check(JSON.stringify(on1) !== JSON.stringify(off1), 'step 2: the pixel buffer differs with the flag on');
await t.shot('T14-route-area-first-floor');
await ev(() => window.__mepSketchScene.setRouteAreaVisible(false));
await idle(500);
check(JSON.stringify(await clipPixels(page, nodeScreen)) === JSON.stringify(off1), 'step 2: after false the buffer is the first buffer again');

// 3
check(await sameAsBaseline(page, base), 'step 3: project JSON, canUndo and isDirty unchanged after the flag changes');

// 4
await ev(() => window.__mepSketchScene.setRouteAreaVisible(true));
await idle(400);
const officeIds = rooms.filter((r) => r.pageIndex === 0 && r.roomTypeId === 'office').map((r) => r.id).sort();
console.log(`office rooms: ${officeIds.length}`);
await ev(() => window.__mepSketchScene.setRouteAreaRoomTypes(['office']));
view = await routeAreaView(page);
check(JSON.stringify(view.area.rooms.map((r) => r.roomId).sort()) === JSON.stringify(officeIds), 'step 4: office list gives the office rooms', `${view.area.rooms.length} vs ${officeIds.length}`);
await ev(() => window.__mepSketchScene.setRouteAreaRoomTypes([]));
view = await routeAreaView(page);
await idle(400);
check(view.area.status === 'no-types', 'step 4: empty list gives no-types', view.area.status);
check((await colorPixelsIn(page, nodeScreen, isPurple)) === 0 && (await colorPixelsIn(page, nodeScreen, isTeal)) === 0, 'step 4: overlay shows nothing for no-types');
await ev(() => window.__mepSketchScene.setRouteAreaRoomTypes(['shaft']));
view = await routeAreaView(page);
check(view.area.rooms.length === 1 && view.area.rooms[0].roomId === shaftId, 'step 4: shaft list gives only the shaft room', JSON.stringify(view.area.rooms.map((r) => r.roomId)));
check(view.area.nodes.some((n) => n.kind === 'shaft') && !view.area.edges.some((e) => e.kind === 'center'), 'step 4: a shaft node and no center edge');
await ev(() => window.__mepSketchScene.setRouteAreaRoomTypes(['corridor', 'shaft']));
view = await routeAreaView(page);
check(view.area.status === 'ok' && view.area.rooms.length === expected.length, 'step 4: default list restored', `${view.area.rooms.length}`);
await idle(400);

// 6: zoom out and compare the center line width in screen pixels. An axis-aligned piece of a center edge is chosen; the width is the
// number of purple pixels on the one pixel row (or column) across the line, in a 40 by 40 clip around the middle of the piece.
const pieces = [];
for (const e of view.area.edges.filter((e) => e.kind === 'center')) {
  for (let i = 1; i < e.points.length; i++) {
    const p = e.points[i - 1];
    const q = e.points[i];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len >= 60 && (Math.abs(p.x - q.x) < 0.01 || Math.abs(p.y - q.y) < 0.01)) pieces.push({ mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, vertical: Math.abs(p.x - q.x) < 0.01, len });
  }
}
pieces.sort((x, y) => y.len - x.len);
await ev(() => window.__mepSketchScene.zoomBy(0.5));
await idle(500);
let piece = null;
for (const pc of pieces) {
  if (await onCanvas(pc.mid)) {
    piece = pc;
    break;
  }
}
console.log(`step 6: ${pieces.length} axis-aligned pieces, chosen length ${piece ? piece.len.toFixed(0) : 'none'} pt`);
if (!piece) {
  console.log('step 6: not verified because no axis-aligned piece of a center edge (60 pt or longer) has its middle on the canvas');
} else {
  const measure = async () => {
    const sc = await ev(() => window.__mepSketchScene.world.scale.x);
    const q = await screenOf(page, piece.mid);
    const px = await clipPixels(page, q);
    const vp = page.viewportSize();
    const x0 = Math.max(0, Math.min(vp.width - 40, Math.round(q.x - 20)));
    const y0 = Math.max(0, Math.min(vp.height - 40, Math.round(q.y - 20)));
    const cx = Math.round(q.x) - x0;
    const cy = Math.round(q.y) - y0;
    let n = 0;
    for (let k = 0; k < 40; k++) {
      const col = piece.vertical ? k : cx;
      const row = piece.vertical ? cy : k;
      const i = (row * 40 + col) * 4;
      if (isPurple(px[i], px[i + 1], px[i + 2])) n++;
    }
    return { sc, n };
  };
  const z0 = await measure();
  await ev(() => window.__mepSketchScene.zoomBy(0.7));
  await idle(500);
  const z1 = await measure();
  await t.shot('T14-route-area-zoomed-out');
  await ev(() => window.__mepSketchScene.zoomBy(1 / 0.7));
  await idle(300);
  console.log(`zoom: scale ${z0.sc.toFixed(3)} width ${z0.n} px; scale ${z1.sc.toFixed(3)} width ${z1.n} px`);
  if (z0.n > 0 && z1.n > 0) check(Math.abs(z0.n - z1.n) <= 1, 'step 6: center line width stays within 1 px at two zooms', `${z0.n} vs ${z1.n}`);
  else check(false, 'step 6: purple pixels found at both zooms', `z0 ${z0.n}, z1 ${z1.n}`);
}
await ev(() => window.__mepSketchScene.zoomBy(2));
await idle(400);

// 9: debounce
const typeChange = rooms.find((r) => r.pageIndex === 0 && r.roomTypeId !== 'corridor' && r.roomTypeId !== 'shaft');
const d1 = await ev((id) => {
  const s = window.__mepSketchScene;
  const events = [];
  s.on('routeAreaPendingChanged', (v) => events.push(`pending:${v}`));
  s.on('routeAreaChanged', () => events.push('changed'));
  window.__events = events;
  s.setRoomType([id], 'corridor');
  return s.isRouteAreaPending();
}, typeChange.id);
check(d1 === true, 'step 9: pending is true at once after a room type change (flag on)');
await page.waitForTimeout(600);
const d2 = await ev(() => ({ pending: window.__mepSketchScene.isRouteAreaPending(), ids: window.__mepSketchScene.getRouteArea().area.rooms.map((r) => r.roomId), events: window.__events }));
check(d2.pending === false && d2.ids.includes(typeChange.id), 'step 9: after 600 ms pending is false and the area holds the new room', JSON.stringify(d2.events));
check(JSON.stringify(d2.events) === JSON.stringify(['pending:true', 'pending:false', 'changed']), 'step 9: events in order', JSON.stringify(d2.events));
// flag off: no pending, no compute (the cache keeps the old rooms object)
await ev(() => window.__mepSketchScene.setRouteAreaVisible(false));
const d3 = await ev((id) => {
  const s = window.__mepSketchScene;
  s.setRoomType([id], 'office');
  return s.isRouteAreaPending();
}, typeChange.id);
await page.waitForTimeout(600);
const d4 = await ev(() => {
  const s = window.__mepSketchScene;
  return { pending: s.isRouteAreaPending(), stale: s.routeAreaCache.rooms !== s.doc.drawingHistory.getState().rooms };
});
check(d3 === false && d4.pending === false, 'step 9: flag off: pending stays false');
check(d4.stale === true, 'step 9: flag off: no compute (the cache still holds the old rooms object)');
check((await colorPixelsIn(page, nodeScreen, isPurple)) === 0, 'step 9: flag off: the layer is empty');

// 5 and 7: a second document (calibrated, no rooms), then back to the first document
await ev(() => window.__mepSketchScene.setRouteAreaVisible(true));
await idle(600);
await t.openPdf(PDF2, 'second.pdf');
const docs = await ev(() => window.__mepSketchScene.getDocuments().map((d) => d.id));
check(docs.length === 2, 'step 5: a second document is open', String(docs.length));
await ev(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));
await idle(600);
view = await routeAreaView(page);
check(view.area.status === 'no-rooms', 'step 5: status no-rooms', view.area.status);
check(JSON.stringify(view.warnings.map((w) => w.code)) === JSON.stringify(['no-rooms', 'draft-2d']), 'step 5: warnings are no-rooms and draft-2d', view.warnings.map((w) => w.code).join(','));
await t.shot('T14-route-area-empty');
await ev((id) => window.__mepSketchScene.activateDocument(id), firstDocId);
await idle(800);
view = await routeAreaView(page);
check(view.area.status === 'ok' && view.area.rooms.length > 0, 'step 7: back on the first document the area is ok', view.area.status);
const purpleBack = await colorPixelsIn(page, await screenOf(page, node.point), isPurple);
check(purpleBack > 0, 'step 7: the layer is redrawn after documentActivated', `purple ${purpleBack}`);
await t.finish();
