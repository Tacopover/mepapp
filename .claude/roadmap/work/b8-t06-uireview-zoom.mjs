// UI review of B8-T06: zoomed pictures of the picker, geometry of the menu and the Properties block, contrast of the dim state.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, screenOf, focusRings } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const width = 1600;
const t = await open({ width, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
await switchTo(t, 'l1.pdf');
const ringPt = async () => { const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt); return { x: 300, y: H - 300 }; };
async function rightClick() {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await focusRings(page);
  const at = await screenOf(page, await ringPt());
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
}
async function zoomClone(sel, name, z = 5) {
  await page.evaluate(([sel, z]) => {
    document.getElementById('uir-clone')?.remove();
    const src = document.querySelector(sel);
    const d = document.createElement('div');
    d.id = 'uir-clone';
    d.style.cssText = `position:fixed;left:0;top:0;z-index:99999;background:#fff;zoom:${z};padding:6px;`;
    const c = src.cloneNode(true);
    c.style.position = 'static';
    d.appendChild(c);
    document.body.appendChild(d);
  }, [sel, z]);
  await idle(200);
  const box = await page.locator('#uir-clone').boundingBox();
  await page.screenshot({ path: `/tmp/mepapp-shots/${name}.png`, clip: { x: 0, y: 0, width: Math.min(box.width, 1600), height: Math.min(box.height, 1000) } });
  console.log('SHOT', name);
  await page.evaluate(() => document.getElementById('uir-clone')?.remove());
}

await rightClick();
const geo = await page.evaluate(() => {
  const m = document.querySelector('.mep-draw-from-menu');
  const mb = m.getBoundingClientRect();
  const r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left - mb.left), Math.round(b.top - mb.top), Math.round(b.width), Math.round(b.height)]; };
  const out = { menu: [Math.round(mb.width), Math.round(mb.height)] };
  out.items = [...m.children].map((c) => [c.className.slice(0, 40), (c.innerText || '').trim().slice(0, 20), r(c)]);
  const txt = (e) => { const range = document.createRange(); range.selectNodeContents(e); const b = range.getBoundingClientRect(); return Math.round(b.left - mb.left); };
  out.textLeft = [...m.querySelectorAll('button')].filter((b) => !b.classList.contains('mep-arrow-cell')).map((b) => [b.innerText.trim().slice(0, 20), txt(b.lastChild ?? b)]);
  const cs = (e, p) => getComputedStyle(e)[p];
  const solve = m.querySelector('[data-testid=riser-arrow-solve]');
  out.dim = { color: cs(solve, 'color'), bg: cs(m, 'backgroundColor'), ink: cs(m.querySelector('[data-testid=riser-arrow-none]'), 'color'), fontSize: cs(solve, 'fontSize'), heading: cs(m.querySelector('.mep-draw-from-menu-heading'), 'color') };
  return out;
});
console.log(JSON.stringify(geo));
await zoomClone('.mep-draw-from-menu', 'B8-T06-uir-menu-zoom');
// hover state
await page.locator('.mep-draw-from-menu [data-testid="riser-arrow-p3"]').hover();
await idle(200);
const clip = await page.locator('.mep-draw-from-menu').boundingBox();
await page.screenshot({ path: '/tmp/mepapp-shots/B8-T06-uir-menu-hover.png', clip });
await page.locator('.mep-draw-from-menu [data-testid="riser-arrow-none"]').hover();
await idle(200);
await page.screenshot({ path: '/tmp/mepapp-shots/B8-T06-uir-menu-hover-none.png', clip });
// choose p7 and show the chosen state at zoom
await page.locator('.mep-draw-from-menu [data-testid="riser-arrow-p7"]').click();
await idle(700);
await rightClick();
await zoomClone('.mep-draw-from-menu', 'B8-T06-uir-menu-zoom-chosen');
await page.keyboard.press('Escape');
await idle(300);

// canvas: zoom the ring at 1x with the arrows of the picture, compare with picker
await page.locator('button.mep-rail-btn[title="Select"]').click();
await focusRings(page);
const at = await screenOf(page, await ringPt());
await page.mouse.click(at.x, at.y);
await idle(500);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(400);
const pg = await page.evaluate(() => {
  const sec = document.querySelector('[data-testid=props-riser-arrows-section]') ?? document.querySelector('.props-riser-section');
  const picker = document.querySelector('[data-testid=riser-arrow-picker]');
  const pb = picker.getBoundingClientRect();
  const panel = picker.closest('.mep-dock, .mep-props, [class*=panel]')?.getBoundingClientRect();
  const row = document.querySelector('[data-testid=props-riser-arrows]').closest('.mep-field-row');
  const rb = row.getBoundingClientRect();
  const texts = [...picker.querySelectorAll('.mep-arrow-text')].map((b) => { const x = b.getBoundingClientRect(); return [b.innerText.trim(), Math.round(x.left - pb.left), Math.round(x.top - pb.top), Math.round(x.width), Math.round(x.height)]; });
  const hint = document.querySelector('[data-testid=props-riser-arrows-hint]').getBoundingClientRect();
  const grid = picker.querySelector('.mep-arrow-picker-grid').getBoundingClientRect();
  return { picker: [Math.round(pb.left), Math.round(pb.width), Math.round(pb.height)], row: [Math.round(rb.left), Math.round(rb.width)], texts, hintLeft: Math.round(hint.left), gridLeft: Math.round(grid.left), panelW: panel && Math.round(panel.width) };
});
console.log('PROPS', JSON.stringify(pg));
await zoomClone('[data-testid=riser-arrow-picker]', 'B8-T06-uir-props-picker-zoom', 5);
await shot('B8-T06-uir-props-1600');
t.finish && t.finish();
