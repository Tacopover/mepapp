// UI review B8-T05: live look and measure of the riser arrows (length, shaft, ring size) at several zoom levels.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, applyLevel, screenOf, waitMarks } from './b8-t05-lib.mjs';

const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await t.start();

const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
await applyLevel(t, 0, cfg);
await switchTo(t, 'l1.pdf');
const r = await waitMarks(page, { rf: '1', rf2: '4' }, 5000);
check(r.ok, 'level 1 shows 1 (supply) and 4 (return)', JSON.stringify(r.got));

async function viewAt(z) {
  await page.evaluate((z) => {
    const s = window.__mepSketchScene;
    const H = s.getDisplayedPageSize().heightPt;
    const r = s.app.canvas.getBoundingClientRect();
    const w = { x: 300, y: H - 300 };
    s.world.scale.set(z);
    s.world.x = r.width / 2 - w.x * z;
    s.world.y = r.height / 2 - w.y * z;
    s.zoomBy(1);
  }, z);
  await page.waitForTimeout(500);
}

async function measure(z) {
  await viewAt(z);
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  const ring = await screenOf(page, { x: 300, y: H - 300 });
  const buf = await page.screenshot();
  const b64 = buf.toString('base64');
  const res = await page.evaluate(
    async ([b64, ring, z]) => {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const x0 = Math.max(0, Math.round(ring.x - 120 * z)), x1 = Math.min(img.width, Math.round(ring.x + 120 * z));
      const y0 = Math.max(0, Math.round(ring.y - 150 * z)), y1 = Math.min(img.height, Math.round(ring.y + 150 * z));
      const d = g.getImageData(x0, y0, x1 - x0, y1 - y0);
      const isBlue = (r, gg, b) => Math.abs(r - 0x21) < 40 && Math.abs(gg - 0x96) < 40 && Math.abs(b - 0xf3) < 40;
      const isPurple = (r, gg, b) => Math.abs(r - 0x7c) < 40 && Math.abs(gg - 0x4d) < 40 && Math.abs(b - 0xff) < 40;
      let ar = null, pr = null;
      const upd = (o, x, y) => (o ? { minX: Math.min(o.minX, x), maxX: Math.max(o.maxX, x), minY: Math.min(o.minY, y), maxY: Math.max(o.maxY, y) } : { minX: x, maxX: x, minY: y, maxY: y });
      const rows = {};
      for (let y = 0; y < d.height; y++) {
        for (let x = 0; x < d.width; x++) {
          const i = (y * d.width + x) * 4;
          const [r, gg, b, a] = [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]];
          if (a < 200) continue;
          const gx = x + x0, gy = y + y0;
          if (isPurple(r, gg, b)) pr = upd(pr, gx, gy);
          else if (isBlue(r, gg, b) && gy < ring.y - 3) {
            ar = upd(ar, gx, gy);
            (rows[gy] ??= []).push(gx);
          }
        }
      }
      // shaft width: horizontal run length on a row at about 30 percent of the arrow height (the shaft zone, away from the head)
      let shaftRun = null;
      if (ar) {
        const yy = Math.round(ar.maxY - 0.3 * (ar.maxY - ar.minY));
        const xs = rows[yy] ?? [];
        shaftRun = xs.length ? Math.max(...xs) - Math.min(...xs) + 1 : null;
      }
      return { ar, pr, shaftRun };
    },
    [b64, ring, z],
  );
  const out = { z };
  if (res.pr) { out.ringDiameterPx = res.pr.maxX - res.pr.minX + 1; }
  if (res.ar) {
    const dx = res.ar.maxX - ring.x, dy = ring.y - res.ar.minY;
    out.arrowTipFromCenterPx = Math.round(Math.hypot(dx, dy) * 10) / 10;
    out.arrowBBox = res.ar;
    out.shaftHorizontalRunPx = res.shaftRun;
    out.shaftWidthPx = res.shaftRun ? Math.round(res.shaftRun * Math.sin(Math.PI / 3) * 10) / 10 : null;
  }
  console.log('MEASURE', JSON.stringify(out));
  return out;
}

const out = {};
for (const z of [0.1, 0.25, 0.5, 1, 2, 4]) {
  out[z] = await measure(z);
  await shot(`B8-T05-uireview-zoom-${String(z).replace('.', '_')}`);
}
// supply arrow at the right-click menu / hover: hover the ring to see the label
await viewAt(1);
const ring = await screenOf(page, { x: 300, y: (await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt)) - 300 });
await page.mouse.move(ring.x, ring.y);
await idle(500);
await shot('B8-T05-uireview-hover-label');
await page.mouse.click(ring.x, ring.y);
await idle(500);
await shot('B8-T05-uireview-selected');
check(errors.length === 0, 'no page or console errors', errors.join(' | '));
await t.finish();
