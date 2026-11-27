// B8-T08 (second run): the steps of .claude/plans/buildings-b8-test.md for the hand-set pair (Undo, Properties, Tab order, Risers tab, toast)
// and for the arrowheads of segments (Solve flow, and the case that the editor flips one level only).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t08-check-b.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, marksOf, waitMarks, screenOf, focusRings } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
const exp = async (name, expected, what) => {
  const r = await waitMarks(page, expected, 4000);
  check(r.ok, `${name}: ${what}`, JSON.stringify(r.got));
  return r;
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
async function chooseFromMenu(which, testid) {
  await rightClick(which);
  await menuLoc.locator(`[data-testid="${testid}"]`).click();
  await idle(700);
}
const toasts = () => page.locator('.mep-toast').allInnerTexts();
async function deleteStamp(id) {
  const pos = await page.evaluate((id) => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === id)?.transform.position ?? null, id);
  if (pos === null) return false;
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await focusRings(page);
  const at = await screenOf(page, pos);
  await page.mouse.click(at.x, at.y);
  await idle(400);
  await page.keyboard.press('Delete');
  await idle(600);
  return !(await page.evaluate((id) => window.__mepSketchScene.exportProject().stamps.some((s) => s.id === id), id));
}

// ---------------------------------------------------------------- Undo leaves the hand-set pair alone
await switchTo(t, 'l1.pdf');
await exp('start level 1', { rf: '1', rf2: '4' }, 'source on level 0: supply 1, return 4');
check(await deleteStamp('t0'), '4: a real drawing action: the terminal t0 of level 1 is deleted (select, Delete key)');
await chooseFromMenu('R1', 'riser-arrow-p2');
await exp('hand-set 2', { rf: '2' }, 'the menu sets pictogram 2');
const undo = page.locator('button.mep-rail-btn[title="Undo"]');
check(await undo.isEnabled(), '4: the Undo button is on after the delete');
await undo.click();
await idle(700);
check(await page.evaluate(() => window.__mepSketchScene.exportProject().stamps.some((s) => s.id === 't0')), '4: Undo brought the deleted terminal back');
await exp('after Undo', { rf: '2' }, 'the hand-set arrow stays after Undo (Undo changed the drawing only)');

// ---------------------------------------------------------------- Properties and the Tab order
await page.locator('button.mep-rail-btn[title="Select"]').click();
await focusRings(page);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await idle(300);
{
  const at = await screenOf(page, await ringPt('R1'));
  await page.mouse.click(at.x, at.y);
  await idle(500);
  const sect = page.locator('[data-testid="props-riser-section"]');
  console.log('PROPS HEADING', JSON.stringify((await sect.locator('h4').innerText()).trim()));
  console.log('PROPS TAG', JSON.stringify(await sect.locator('.mep-rp-tag').allInnerTexts()));
  console.log('PROPS ROWS', JSON.stringify((await sect.locator('.mep-field-row').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())));
  console.log('PROPS HINTS', JSON.stringify(await sect.locator('.mep-hint').allInnerTexts()));
  await snap('B8-T08-properties-hand');
  let found = 0;
  for (let i = 1; i <= 80; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => !!document.activeElement?.closest('[data-testid="riser-arrow-picker"]'))) { found = i; break; }
  }
  console.log('TAB COUNT to the picker (Properties open, after a click on the ring)', found || 'not found in 80');
  console.log('FOCUSED', await page.evaluate(() => document.activeElement?.getAttribute('data-testid')));
  // a second Tab leaves the group; the dim "Use the flow solve" has no tab stop while the ring follows the solve
  await page.keyboard.press('Tab');
  console.log('NEXT FOCUS after the picker', await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName));
}
// Properties of a ring that follows the solve: row text, check mark
await page.locator('[data-testid="riser-arrow-solve"]').click();
await idle(600);
await exp('solve again', { rf: '1' }, 'Use the flow solve in Properties');
check((await page.locator('[data-testid="props-riser-arrows"]').innerText()).trim() === 'From the flow solve', '4: the row Arrows says From the flow solve');
await snap('B8-T08-properties-solve');

// ---------------------------------------------------------------- disagreement: toast and Risers tab
await chooseFromMenu('R1', 'riser-arrow-p6');
await switchTo(t, 'l0.pdf');
await chooseFromMenu('R1', 'riser-arrow-p2');
{
  const texts = await toasts();
  console.log('TOASTS', JSON.stringify(texts));
  check(texts.some((x) => x === 'Arrows of R1 disagree on the span Level 0 to Level 1. Change the arrows on one of the two levels.'), '4: toast with the warning text', JSON.stringify(texts));
  await snap('B8-T08-toast');
}
{
  const dlg = page.locator(M);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  console.log('WARNINGS', JSON.stringify((await dlg.locator('[data-testid="riser-warnings"]').innerText()).replace(/\s+/g, ' ')));
  console.log('ROW TAGS', JSON.stringify(await dlg.locator('[data-testid="riser-row-arrows-tag"]').allInnerTexts()));
  console.log('FLOW BOX', JSON.stringify((await dlg.locator('.mep-rp-flow, [data-testid="riser-flow-box"]').allInnerTexts()).map((x) => x.replace(/\s+/g, ' '))));
  await snap('B8-T08-risers-tab');
  await page.keyboard.press('Escape');
  await idle(400);
}
// back to the solve on both levels
await chooseFromMenu('R1', 'riser-arrow-solve');
await switchTo(t, 'l1.pdf');
await chooseFromMenu('R1', 'riser-arrow-solve');
await exp('cleared', { rf: '1', rf2: '4' }, 'both rings follow the solve again');

// ---------------------------------------------------------------- arrowheads of segments (Part 5) and the editor on one level only
const midOf = (id) => page.evaluate((id) => { const s = window.__mepSketchScene.exportProject().segments.find((x) => x.id === id); const a = s.geometry[0]; const b = s.geometry[s.geometry.length - 1]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }, id);
async function clickSegment(id) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  const at = await screenOf(page, await midOf(id));
  await page.mouse.click(at.x, at.y);
  await idle(400);
}
const sceneSide = (id) => page.evaluate((id) => {
  const scene = window.__mepSketchScene;
  const seg = scene.exportProject().segments.find((x) => x.id === id);
  const a = seg.geometry[0];
  const b = seg.geometry[seg.geometry.length - 1];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const g = scene.doc.flowLabelLayer.children.find((c) => !('text' in c));
  if (!g) return 'none';
  const wings = [];
  for (const ins of g.context.instructions) {
    const list = ins.data?.path?.instructions ?? [];
    for (let i = 0; i < list.length - 1; i++) {
      if (list[i].action === 'moveTo' && Math.hypot(list[i].data[0] - mid.x, list[i].data[1] - mid.y) < 0.01 && list[i + 1].action === 'lineTo') wings.push(list[i + 1].data[0]);
    }
  }
  if (wings.length === 0) return 'none';
  return wings.reduce((s, x) => s + x, 0) / wings.length < mid.x ? 'east' : 'west';
}, id);
async function solveFlowClick() {
  await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
  await idle(300);
  await page.locator('button.mep-icon-btn', { hasText: /Solve flow/ }).click();
  await idle(400);
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(300);
}
await switchTo(t, 'l0.pdf');
await focusRings(page);
await solveFlowClick();
await clickSegment('s1');
check((await sceneSide('s1')) === 'west', '5: L0 Supply Air s1 (riser fitting to junction): arrowhead points away from the source (toward the riser fitting)', await sceneSide('s1'));
console.log('FLOW LABELS', JSON.stringify(await page.evaluate(() => window.__mepSketchScene.doc.flowLabelLayer.children.filter((c) => 'text' in c).map((c) => c.text))));
await focusRings(page);
await snap('B8-T08-arrowheads-l0');
// Flow direction Return on level 1 only, with the building open
await switchTo(t, 'l1.pdf');
await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
await page.locator('.mep-discipline-btn', { hasText: /^HVAC$/ }).first().click();
await idle(300);
await page.locator('.mep-networktype-tile', { hasText: /^\s*Supply Air\s*/ }).first().locator('button[title="Edit"]').click();
await page.locator(M).waitFor({ timeout: 20000 });
await page.locator(`${M} [data-testid=nt-flow-sense]`).selectOption('return');
await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
await idle(600);
await exp('level 1 flipped', { rf: '4' }, 'level 1: Supply Air now Return: the ring shows 4');
await switchTo(t, 'l0.pdf');
await exp('level 0 after the flip on level 1', { rf: '5' }, 'level 0 ring follows the riser copy: Return, pictogram 5');
await solveFlowClick();
await clickSegment('s1');
const sideL0 = await sceneSide('s1');
console.log('L0 s1 arrowhead after the flip on level 1 only:', sideL0, '(west = still supply, because the document of level 0 keeps its own type)');
check(sideL0 === 'west', '5: level 0 segment arrowhead still follows the type of the document of level 0 (supply)', sideL0);
await focusRings(page);
await snap('B8-T08-flip-one-level-l0');

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
