// B4-T10 no-flag check: plain app (production store, no dev stubs, no building). A fitting menu has no riser entry; the dialog has no Risers tab.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b4/.claude/roadmap/browser/lib.mjs';

const W = '/root/MepApp/.claude/worktrees/buildings-b4/fixtures/pdfs/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, shot, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');
await t.openPdf(W + '00_arch_ground_floor.pdf', 'ground.pdf');
const screenOf = (p) =>
  page.evaluate((p) => {
    const s = window.__mepSketchScene;
    const g = s.world.toGlobal(p);
    const r = s.app.canvas.getBoundingClientRect();
    return { x: r.left + g.x, y: r.top + g.y };
  }, p);
await page.locator('button.mep-rail-btn[title="Segment"]').click();
for (const p of [{ x: 300, y: 400 }, { x: 500, y: 400 }]) {
  const at = await screenOf(p);
  await page.mouse.click(at.x, at.y);
  await idle(500);
}
await page.keyboard.press('Escape');
await page.locator('button.mep-rail-btn[title="Select"]').click();
await idle(300);
const at = await screenOf({ x: 300, y: 400 });
await page.mouse.click(at.x, at.y, { button: 'right' });
await idle(500);
const items = await page.locator('.mep-draw-from-menu button').allInnerTexts();
console.log('FITTING MENU', JSON.stringify(items));
check(!items.some((i) => /riser/i.test(i)), 'the fitting menu has no riser entry', JSON.stringify(items));
await shot('B4-T10-noflag-menu');
await page.keyboard.press('Escape');
await idle(300);
await menu('Manage Buildings…');
const dlg = page.locator('.mep-modal');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
check((await dlg.getByRole('tab', { name: /^Risers/ }).count()) === 0, 'no Risers tab without a building');
await shot('B4-T10-noflag');
await page.keyboard.press('Escape');
await idle(400);
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
