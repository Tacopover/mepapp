// UI review of B8-T06: fonts of the menu heading, Properties block at 760 px, tab order, stress names.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, screenOf, focusRings } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const width = 760;
const t = await open({ width, height: 900, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
await switchTo(t, 'l1.pdf');
const ringPt = async () => { const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt); return { x: 300, y: H - 300 }; };
await page.locator('button.mep-rail-btn[title="Select"]').click();
await focusRings(page);
const at = await screenOf(page, await ringPt());
await page.mouse.click(at.x, at.y, { button: 'right' });
await idle(400);
const fonts = await page.evaluate(() => {
  const m = document.querySelector('.mep-draw-from-menu');
  const f = (e) => { const c = getComputedStyle(e); return [c.fontFamily.slice(0, 50), c.fontSize, c.fontWeight]; };
  return { heading: f(m.querySelector('.mep-draw-from-menu-heading')), btn: f(m.querySelector('.mep-draw-from-menu-btn')), none: f(m.querySelector('[data-testid=riser-arrow-none]')), body: f(document.body) };
});
console.log('FONTS', JSON.stringify(fonts));
await page.keyboard.press('Escape');
await idle(300);
await page.mouse.click(at.x, at.y);
await idle(500);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(400);
const g = await page.evaluate(() => {
  const picker = document.querySelector('[data-testid=riser-arrow-picker]');
  const pb = picker.getBoundingClientRect();
  const texts = [...picker.querySelectorAll('.mep-arrow-text')].map((b) => { const x = b.getBoundingClientRect(); return [b.innerText.trim(), Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)]; });
  const sec = picker.closest('.mep-section, .props-riser-section') ?? picker.parentElement;
  const sb = sec.getBoundingClientRect();
  return { picker: [Math.round(pb.left), Math.round(pb.width), Math.round(pb.height)], section: [Math.round(sb.left), Math.round(sb.width)], texts, scrollW: document.documentElement.scrollWidth };
});
console.log('PROPS760', JSON.stringify(g));
await shot('B8-T06-uir-props-760');
// Tab order from the Kind select into the picker
await page.locator('select').first().focus().catch(() => {});
const order = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press('Tab');
  const id = await page.evaluate(() => { const e = document.activeElement; return e?.getAttribute('data-testid') || e?.getAttribute('aria-label') || e?.tagName; });
  order.push(id);
  if (/riser-arrow/.test(id ?? '')) break;
}
console.log('TAB', JSON.stringify(order));
await shot('B8-T06-uir-props-760-focus');
// focus style of the picker cell
const focusStyle = await page.evaluate(() => { const e = document.activeElement; const c = getComputedStyle(e); return [c.outlineStyle, c.outlineWidth, c.outlineColor, e.className]; });
console.log('FOCUS', JSON.stringify(focusStyle));
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
await shot('B8-T06-uir-props-760-focus2');
t.finish && t.finish();
