// B8-T06 at 760 px: the right-click menu with the picker, for a ring near the right and the bottom edge of the window.
// Setup uses the scene API and the dev hook only. The right-click and the click on the picker cell are real mouse input.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t06-narrow-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, waitMarks, screenOf } from './b8-t05-lib.mjs';

const t = await open({ width: 760, height: 900, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, anchors } = await setup(t, { withReturn: true, sources1: [0], sources2: [], extra: [] });
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
await switchTo(t, 'l1.pdf');
await page.locator('button.mep-rail-btn[title="Select"]').click();

const ringScreen = async () => {
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  return screenOf(page, { x: 300, y: H - 300 });
};
const vp = page.viewportSize();
const cv = await page.evaluate(() => { const r = window.__mepSketchScene.app.canvas.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; });
console.log('canvas', JSON.stringify(cv));
for (const [name, wantX, wantY] of [['corner', cv.right - 25, cv.bottom - 40], ['middle', (cv.left + cv.right) / 2, (cv.top + cv.bottom) / 2]]) {
  const now = await ringScreen();
  await page.evaluate(([dx, dy]) => { const s = window.__mepSketchScene; s.world.x += dx; s.world.y += dy; s.zoomBy(1); }, [wantX - now.x, wantY - now.y]);
  await page.waitForTimeout(400);
  const at = await ringScreen();
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(500);
  const menu = page.locator('.mep-draw-from-menu');
  check((await menu.count()) === 1, `${name}: the menu opens`);
  const box = await menu.boundingBox();
  check(box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, `${name}: the menu is inside the window`, JSON.stringify(box));
  check(box !== null && box.x >= cv.left && box.y >= cv.top && box.x + box.width <= cv.right && box.y + box.height <= cv.bottom, `${name}: the menu is inside the canvas area (not hidden under the dock)`, JSON.stringify({ box, cv }));
  const hit = await page.evaluate((b) => document.elementFromPoint(b.x + b.width - 6, b.y + b.height / 2)?.closest('.mep-draw-from-menu') !== null, box);
  check(hit, `${name}: the right edge of the menu is on top (not covered by another panel)`);
  const cells = await menu.locator('.mep-arrow-cell').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
  const m = box;
  check(cells.length === 8 && cells.every(([l, tp, r, b]) => l >= m.x - 1 && r <= m.x + m.width + 1 && tp >= m.y - 1 && b <= m.y + m.height + 1), `${name}: no cell is cut by the menu`, JSON.stringify(cells));
  await shot(`B8-T06-menu-760-${name}`);
  if (name === 'corner') {
    await menu.locator('[data-testid="riser-arrow-p6"]').click();
    await idle(700);
    const r = await waitMarks(page, { rf: '6' }, 4000);
    check(r.ok, 'corner: a click on a cell at 760 px sets pictogram 6', JSON.stringify(r.got));
  } else {
    await page.keyboard.press('Escape');
    await idle(300);
  }
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
