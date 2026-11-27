// B8-T08 (fourth run): a dashed ring (the riser has no member on Level 2) and the tag "Arrows set by hand" in the Risers tab (select the riser lane first).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t08-check-d.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, waitMarks, screenOf, focusRings } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const file = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
file.risers[0].members = file.risers[0].members.filter((m) => m.levelId !== 'l2');
await loadBuilding(t, JSON.stringify(file));
const exp = async (name, expected, what) => {
  const r = await waitMarks(page, expected, 4000);
  check(r.ok, `${name}: ${what}`, JSON.stringify(r.got));
};
const ringPt = async (which) => { const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt); return { x: 300, y: H - (which === 'R1' ? 300 : 520) }; };
const menuLoc = page.locator('.mep-draw-from-menu');
async function rightClick(which) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await focusRings(page);
  const p = await screenOf(page, await ringPt(which));
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await idle(400);
}
await switchTo(t, 'l0.pdf');
await exp('level 0', { rf: '2', rf2: '5' }, 'R1 has two members now: level 0 shows 2, R2 shows 5');
await switchTo(t, 'l1.pdf');
await exp('level 1', { rf: '3', rf2: '4' }, 'level 1 is the top of R1: pictogram 3');
await switchTo(t, 'l2.pdf');
await exp('level 2', { rf2: '6' }, 'level 2: R1 has no mark here (dashed ring), R2 shows 6');
await focusRings(page);
await page.screenshot({ path: `${SHOTS}B8-T08-dashed-ring-l2.png` });
console.log(`SHOT ${SHOTS}B8-T08-dashed-ring-l2.png`);
await rightClick('R1');
{
  const items = (await menuLoc.locator('button').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
  console.log('DASHED MENU', JSON.stringify(items));
  check(items.length === 1 && items[0] === 'Draw from', 'the menu of a dashed ring has only Draw from', JSON.stringify(items));
}
await page.keyboard.press('Escape');
await idle(300);
// hand-set pairs on level 1 and level 0 of R1, then the Risers tab
await switchTo(t, 'l1.pdf');
await rightClick('R1');
await menuLoc.locator('[data-testid="riser-arrow-p6"]').click();
await idle(700);
await switchTo(t, 'l0.pdf');
await rightClick('R1');
await menuLoc.locator('[data-testid="riser-arrow-p2"]').click();
await idle(700);
{
  const dlg = page.locator(M);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  const lanes = await dlg.getByRole('radio').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  console.log('LANES', JSON.stringify(lanes));
  console.log('TAGS before selecting R1', JSON.stringify(await dlg.locator('[data-testid="riser-row-arrows-tag"]').allInnerTexts()));
  await dlg.getByRole('radio', { name: /^R1/ }).click();
  await idle(600);
  const tags = await dlg.locator('[data-testid="riser-row-arrows-tag"]').allInnerTexts();
  console.log('TAGS after selecting R1', JSON.stringify(tags));
  check(tags.length === 2 && tags.every((x) => x.trim() === 'Arrows set by hand'), 'the rows of Level 0 and Level 1 show the line Arrows set by hand when R1 is selected', JSON.stringify(tags));
  await page.screenshot({ path: `${SHOTS}B8-T08-risers-tab-tags.png` });
  console.log(`SHOT ${SHOTS}B8-T08-risers-tab-tags.png`);
  await page.keyboard.press('Escape');
}
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
