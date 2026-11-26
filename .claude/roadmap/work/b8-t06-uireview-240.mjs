// UI review of B8-T06: Properties block with a 240 px panel (dock width forced), hand-set state, hover of text items.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, screenOf, focusRings } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const t = await open({ width: 1600, height: 900, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
await switchTo(t, 'l1.pdf');
const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
await page.locator('button.mep-rail-btn[title="Select"]').click();
await focusRings(page);
const at = await screenOf(page, { x: 300, y: H - 300 });
await page.mouse.click(at.x, at.y);
await idle(500);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(400);
await page.locator('[data-testid="riser-arrow-picker"] [data-testid="riser-arrow-none"]').click();
await idle(700);
const info = await page.evaluate(() => {
  let e = document.querySelector('[data-testid=riser-arrow-picker]');
  const chain = [];
  while (e && e !== document.body) { chain.push([e.className.toString().slice(0, 40), Math.round(e.getBoundingClientRect().width)]); e = e.parentElement; }
  return chain;
});
console.log('CHAIN', JSON.stringify(info));
// force the dock narrow: find the ancestor whose width is the dock (largest width below 600 that has the tab bar)
const forced = await page.evaluate(() => {
  const dock = document.querySelector('.mep-dock, [class*=dock]');
  const cands = [...document.querySelectorAll('[class*=dock]')].map((e) => [e.className.toString().slice(0, 40), Math.round(e.getBoundingClientRect().width)]);
  return cands.slice(0, 12);
});
console.log('DOCK', JSON.stringify(forced));
await page.evaluate(() => {
  const picker = document.querySelector('[data-testid=riser-arrow-picker]');
  const sec = picker.closest('.mep-section') ?? picker.parentElement.parentElement;
  const wrap = document.createElement('div');
  wrap.id = 'uir-narrow';
  wrap.style.cssText = 'position:fixed;left:20px;top:20px;width:240px;z-index:99999;background:#fff;border:1px solid #888;padding:0 0';
  wrap.appendChild(sec.cloneNode(true));
  document.body.appendChild(wrap);
});
await idle(300);
const box = await page.locator('#uir-narrow').boundingBox();
await page.screenshot({ path: '/tmp/mepapp-shots/B8-T06-uir-props-240.png', clip: { x: 0, y: 0, width: 300, height: Math.min(box.height + 40, 400) } });
console.log('SHOT B8-T06-uir-props-240', JSON.stringify(box));
const texts = await page.evaluate(() => [...document.querySelectorAll('#uir-narrow .mep-arrow-text')].map((b) => { const x = b.getBoundingClientRect(); return [b.innerText.trim(), Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]; }));
console.log('TEXTS240', JSON.stringify(texts));
t.finish && t.finish();
