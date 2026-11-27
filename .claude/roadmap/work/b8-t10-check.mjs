// B8-T10: runs the steps of part B of .claude/plans/buildings-b8-test.md (the Risers tab diagram) that a headless Chromium can run, to check each UI word and each result in the script.
// Setup (documents, scale, project JSON per level, building file) uses the scene API and the dev hook only (as b8-t08-check.mjs).
// Real DOM: the Levels tab (Elevation), the Risers tab (lanes, heads, Set by hand, Source level, Direction), the ring menu, the type editor (Flow direction, Pattern, Save).
// Reading: the SVG of the diagram, the aria-label of a lane, the box "Flow direction", the legend, scene.getRiserMarks().
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t10-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, waitMarks, applyLevel, focusRings, screenOf } from './b8-t05-lib.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();

const dlg = page.locator('.mep-modal');
const snap = async (name, locator) => {
  const path = `${SHOTS}B8-T10-${name}.png`;
  await (locator ?? page).screenshot({ path });
  console.log(`SHOT ${path}`);
};
const cfg = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const baseJson = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));

async function applyAll(c) {
  for (const i of [0, 2, 1]) {
    try {
      await applyLevel(t, i, c);
    } catch (e) {
      console.log(`retry applyLevel ${i}: ${String(e).slice(0, 120)}`);
      await page.keyboard.press('Escape');
      await idle(1500);
      await applyLevel(t, i, c);
    }
  }
}
async function openRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await idle(500);
}
const heads = async () => {
  const list = await dlg.locator('[data-testid="riser-span-arrow"]').evaluateAll((els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { lane: e.closest('[data-riser-id]')?.getAttribute('data-riser-id'), dir: e.getAttribute('data-direction'), title: e.querySelector('title')?.textContent ?? null, dash: getComputedStyle(e).strokeDasharray, y: r.y + r.height / 2 };
    }),
  );
  return list.sort((a, b) => (a.lane < b.lane ? -1 : a.lane > b.lane ? 1 : a.y - b.y));
};
const dirsOf = (list, lane) => list.filter((h) => h.lane === lane).map((h) => h.dir);
const boxText = async () => (await dlg.locator('[data-testid="riser-flow-text"]').innerText()).trim();
const notes = async () => (await dlg.locator('[data-testid="riser-flow-note"]').allInnerTexts()).map((x) => x.trim());
const laneAria = (id) => dlg.locator(`[data-riser-id="${id}"]`).getAttribute('aria-label');
async function pickLane(id) {
  await dlg.locator(`[data-riser-id="${id}"] .mep-rd-lane-label`).click();
  await idle(400);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const laneDash = (id) => dlg.locator(`[data-riser-id="${id}"] line`).first().evaluate((e) => ({ attr: e.getAttribute('stroke-dasharray'), css: getComputedStyle(e).strokeDasharray }));
/** True when the middle of the element is the topmost thing at its point and inside the window: the user sees it without a scroll. */
const seen = (loc) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + Math.min(r.height / 2, 10);
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const top = document.elementFromPoint(x, y);
    return !!top && (el === top || el.contains(top));
  });

// ---------------------------------------------------------------- B1: supply and return, the legend, the click on a head
await loadBuilding(t, JSON.stringify(baseJson));
await applyAll(cfg);
for (const [name, exp] of [['l0.pdf', { rf: '2', rf2: '5' }], ['l1.pdf', { rf: '1', rf2: '4' }], ['l2.pdf', { rf: '3', rf2: '6' }]]) {
  await switchTo(t, name);
  const r = await waitMarks(page, exp, 4000);
  check(r.ok, `B1 canvas ${name}: pictograms ${JSON.stringify(exp)}`, JSON.stringify(r.got));
}
await openRisers();
{
  const tabs = await dlg.getByRole('tab').allInnerTexts();
  console.log('TABS', JSON.stringify(tabs));
  const legend = (await dlg.locator('.mep-rd-legend').innerText()).split('\n').map((x) => x.trim()).filter(Boolean);
  check(same(legend, ['at position', 'waiting', 'not at position', 'flow direction']), 'B1 legend has 4 rows, the last is "flow direction"', JSON.stringify(legend));
  const names = (await dlg.locator('.mep-rd-lane-label').allTextContents()).map((x) => x.trim());
  console.log('LANE NAMES', JSON.stringify(names));
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'up']) && same(dirsOf(h, 'r2'), ['down', 'down']), 'B1 supply lane: two heads up; return lane: two heads down', JSON.stringify(h.map((x) => [x.lane, x.dir])));
  check(h.every((x) => x.dash === 'none'), 'B1 each head is solid (no dash on the head)', JSON.stringify(h.map((x) => x.dash)));
  const tips = h.map((x) => x.title).sort();
  console.log('HEAD TITLES', JSON.stringify(tips));
  check(same(await laneDash('r2'), { attr: '12 6', css: '12px, 6px' }) || (await laneDash('r2')).attr === '12 6', 'B1 return lane is dashed', JSON.stringify(await laneDash('r2')));
  check((await laneAria('r1')) === 'R1, Level 0 to Level 2, 3 levels, 6.00 m, flow away from Level 0', 'B1 aria-label of the supply lane', await laneAria('r1'));
  check((await laneAria('r2')) === 'R2, Level 0 to Level 2, 3 levels, 6.00 m, flow toward Level 0', 'B1 aria-label of the return lane', await laneAria('r2'));
  check((await dlg.getByRole('radio', { name: /flow toward Level 0$/ }).count()) === 1, 'B1 the lane is found by its accessible name (role radio)');
  await pickLane('r1');
  check((await boxText()) === 'Away from Level 0 · from the flow solve' && same(await notes(), []), 'B1 box of the supply riser', await boxText());
  await snap('b1-supply', dlg);
  await pickLane('r2');
  check((await boxText()) === 'Toward Level 0 · from the flow solve', 'B1 box of the return riser', await boxText());
}
await closeDialog();

// ---------------------------------------------------------------- B2: source in the middle, top, none, two
cfg.sources1 = [1];
cfg.sources2 = [0];
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'down']), 'B2 source on Level 1: top head up, bottom head down (R1)', JSON.stringify(dirsOf(h, 'r1')));
  check(same(dirsOf(h, 'r2'), ['down', 'down']), 'B2 R2 keeps its heads (its source is on Level 0)', JSON.stringify(dirsOf(h, 'r2')));
  await pickLane('r1');
  check((await boxText()) === 'Away from Level 1 · from the flow solve', 'B2 box names Level 1', await boxText());
}
await closeDialog();
cfg.sources1 = [1];
cfg.sources2 = [1];
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r2'), ['down', 'up']), 'B2 return, source on Level 1: top head down, bottom head up', JSON.stringify(dirsOf(h, 'r2')));
  await pickLane('r2');
  check((await boxText()) === 'Toward Level 1 · from the flow solve', 'B2 box of the return riser, source on Level 1', await boxText());
}
await closeDialog();
cfg.sources1 = [2];
cfg.sources2 = [0];
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['down', 'down']), 'B2 source on Level 2: both heads of R1 point down', JSON.stringify(dirsOf(h, 'r1')));
  await pickLane('r1');
  check((await boxText()) === 'Away from Level 2 · from the flow solve', 'B2 box names Level 2', await boxText());
}
await closeDialog();
cfg.sources1 = [];
cfg.sources2 = [0];
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), []) && same(dirsOf(h, 'r2'), ['down', 'down']), 'B2 no source on R1: no head on R1, R2 keeps its heads', JSON.stringify(h.map((x) => [x.lane, x.dir])));
  await pickLane('r1');
  check((await boxText()) === 'No arrows yet: no source level.', 'B2 box: no source level', await boxText());
  const w = (await dlg.locator('[data-testid="riser-warnings"]').innerText()).replace(/\s+/g, ' ');
  console.log('WARNINGS (no source)', JSON.stringify(w));
  check(w.includes('Riser R1 has no source level. Set one by hand.'), 'B2 warning text, no source', w);
  check(!(await laneAria('r1')).includes('flow '), 'B2 the lane label has no flow tail when there is no arrow', await laneAria('r1'));
  await snap('b2-nosource', dlg);
}
await closeDialog();
cfg.sources1 = [0, 2];
await applyAll(cfg);
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), []), 'B2 two sources: no head on R1', JSON.stringify(dirsOf(h, 'r1')));
  await pickLane('r1');
  check((await boxText()) === 'No arrows yet: more than one source level.', 'B2 box: more than one source level', await boxText());
  const w = (await dlg.locator('[data-testid="riser-warnings"]').innerText()).replace(/\s+/g, ' ');
  console.log('WARNINGS (two sources)', JSON.stringify(w));
  check(w.includes('Riser R1 has more than one source level (Level 0, Level 2). Set one by hand.'), 'B2 warning text, two sources', w);
}
await closeDialog();

// ---------------------------------------------------------------- B3: the same height for all levels (real Levels tab, Elevation field)
cfg.sources1 = [0];
cfg.sources2 = [0];
await applyAll(cfg);
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
async function setElevation(levelName, value) {
  await dlg.getByRole('tab', { name: /^Levels and sheets/ }).click();
  await idle(400);
  await dlg.locator('.mep-tree-row, [role=treeitem], .mep-tree-item, .mep-tree-label', { hasText: new RegExp(`^\\s*${levelName}\\b`) }).first().click();
  await idle(400);
  const input = dlg.locator('input[aria-label="Elevation (mm)"]');
  await input.fill(String(value));
  await input.press('Enter');
  await idle(600);
}
try {
  await setElevation('Level 1', 0);
  await setElevation('Level 2', 0);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  const h = await heads();
  check(h.length === 0, 'B3 all levels at 0 mm: no head at all', JSON.stringify(h.map((x) => [x.lane, x.dir])));
  await pickLane('r1');
  check((await boxText()) === 'No arrows. The levels of this riser have the same height.', 'B3 box: same height', await boxText());
  await snap('b3-same-height', dlg);
  await setElevation('Level 1', 3000);
  await setElevation('Level 2', 6000);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  check((await heads()).length === 4, 'B3 heights back to 0, 3000, 6000: the 4 heads come back', String((await heads()).length));
} catch (e) {
  check(false, 'B3 Elevation field steps ran', String(e).slice(0, 300));
}
await closeDialog();

// ---------------------------------------------------------------- B4: Source level and Direction by hand (real lists)
cfg.sources1 = [];
cfg.sources2 = [];
await applyAll(cfg);
await openRisers();
{
  await pickLane('r1');
  check((await dlg.locator('[data-testid="riser-source-select"]').count()) === 0, 'B4 the lists are hidden before "Set by hand"');
  await dlg.locator('[data-testid="riser-set-by-hand"]').first().click();
  await idle(500);
  const srcOpts = await dlg.locator('[data-testid="riser-source-select"] option').allInnerTexts();
  const dirOpts = await dlg.locator('[data-testid="riser-flow-select"] option').allInnerTexts();
  console.log('SOURCE OPTIONS', JSON.stringify(srcOpts), 'DIRECTION OPTIONS', JSON.stringify(dirOpts));
  const labels = await dlg.locator('.mep-rp-field label').allInnerTexts();
  check(same(labels, ['Source level', 'Direction']), 'B4 the two lists are labelled Source level and Direction', JSON.stringify(labels));
  await dlg.locator('[data-testid="riser-source-select"]').selectOption({ label: 'Level 1' });
  await idle(1200);
  let h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'down']), 'B4 Source level = Level 1: heads at once (top up, bottom down)', JSON.stringify(dirsOf(h, 'r1')));
  check((await boxText()) === 'Away from Level 1 · Set by hand', 'B4 box says Set by hand', await boxText());
  check((await dlg.locator('[data-testid="riser-flow-select"]').inputValue()) === 'up' || true, 'B4 (info) Direction value after the source level', await dlg.locator('[data-testid="riser-flow-select"]').inputValue());
  for (const word of ['Up', 'Down', 'Both']) {
    await dlg.locator('[data-testid="riser-flow-select"]').selectOption({ label: word });
    await idle(800);
    h = await heads();
    check(same(dirsOf(h, 'r1'), ['up', 'down']), `B4 Direction = ${word}: no head changes`, JSON.stringify(dirsOf(h, 'r1')));
    check(same(await notes(), [`Direction set by hand: ${word}. The arrows do not use it.`]), `B4 grey note for ${word}`, JSON.stringify(await notes()));
  }
  check((await boxText()) === 'Away from Level 1 · Set by hand', 'B4 line 1 of the box did not change', await boxText());
  await snap('b4-handset', dlg);
  await dlg.locator('[data-testid="riser-use-solve"]').click();
  await idle(900);
  h = await heads();
  check(same(dirsOf(h, 'r1'), []), 'B4 Use the flow solve: no head (no source)', JSON.stringify(dirsOf(h, 'r1')));
  check((await boxText()) === 'No arrows yet: no source level.' && same(await notes(), []), 'B4 box and notes after Use the flow solve', await boxText());
}
await closeDialog();

// ---------------------------------------------------------------- B5: a hand-set ring pictogram (real ring menu); the diagram keeps the flow solve
cfg.sources1 = [0];
cfg.sources2 = [0];
await applyAll(cfg);
await switchTo(t, 'l1.pdf');
const ringPt = async () => { const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt); return { x: 300, y: H - 300 }; };
const menuLoc = page.locator('.mep-draw-from-menu');
await page.locator('button.mep-rail-btn[title="Select"]').click();
await focusRings(page);
{
  const p = await screenOf(page, await ringPt());
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await idle(400);
  await menuLoc.locator('[data-testid="riser-arrow-p4"]').click();
  await idle(800);
  const r = await waitMarks(page, { rf: '4' }, 4000);
  check(r.ok, 'B5 the ring of R1 on Level 1 shows pictogram 4 (Comes down, goes down) from the menu', JSON.stringify(r.got));
}
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'up']), 'B5 the diagram still shows up, up (the flow solve)', JSON.stringify(dirsOf(h, 'r1')));
  await pickLane('r1');
  check(same(await notes(), ['Some rings use arrows set by hand. The diagram shows the flow solve.']), 'B5 grey note about the hand-set ring', JSON.stringify(await notes()));
  const rows = (await dlg.locator('[data-testid="riser-info"]').innerText()).replace(/\s+/g, ' ');
  check(rows.includes('Arrows set by hand'), 'B5 the row of Level 1 has the tag "Arrows set by hand"', rows.slice(0, 400));
  check((await boxText()) === 'Away from Level 0 · from the flow solve', 'B5 line 1 of the box', await boxText());
  await snap('b5-ring-handset', dlg);
}
await closeDialog();
{
  const p = await screenOf(page, await ringPt());
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await idle(400);
  await menuLoc.locator('[data-testid="riser-arrow-solve"]').click();
  await idle(800);
  const r = await waitMarks(page, { rf: '1' }, 4000);
  check(r.ok, 'B5 "Use the flow solve" brings pictogram 1 back', JSON.stringify(r.got));
}
await openRisers();
{
  await pickLane('r1');
  check(same(await notes(), []), 'B5 the grey note is gone after "Use the flow solve"', JSON.stringify(await notes()));
}
await closeDialog();

// ---------------------------------------------------------------- B6: Flow direction flip in the type editor; Pattern from the editor
const M = '.mep-modal';
async function openEditor(name) {
  await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
  await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
  await page.locator('.mep-discipline-btn', { hasText: /^All$/ }).first().click();
  await idle(300);
  await page.locator('.mep-networktype-tile', { hasText: new RegExp(`^\\s*${name}\\s*`) }).first().locator('button[title="Edit"]').click();
  await page.locator(M).waitFor({ timeout: 20000 });
  await idle(250);
}
const saveEditor = async () => {
  await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
  await idle(900);
};
await switchTo(t, 'l1.pdf');
await openEditor('Supply Air');
await page.locator(`${M} [data-testid=nt-flow-sense]`).selectOption('return');
await saveEditor();
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['down', 'down']), 'B6 editor flip to Return on Level 1: the diagram shows down, down', JSON.stringify(dirsOf(h, 'r1')));
  await pickLane('r1');
  check((await boxText()) === 'Toward Level 0 · from the flow solve', 'B6 box after the flip', await boxText());
  check((await laneAria('r1')).endsWith(', flow toward Level 0'), 'B6 lane label after the flip', await laneAria('r1'));
  await snap('b6-flip', dlg);
}
await closeDialog();
{
  const r1 = await waitMarks(page, { rf: '4' }, 4000);
  check(r1.ok, 'B6 canvas Level 1 after the flip: pictogram 4', JSON.stringify(r1.got));
  await switchTo(t, 'l0.pdf');
  const r0 = await waitMarks(page, { rf: '5' }, 4000);
  check(r0.ok, 'B6 canvas Level 0 after the flip: pictogram 5', JSON.stringify(r0.got));
}
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['down', 'down']), 'B6 the diagram opened from Level 0 shows the same: down, down', JSON.stringify(dirsOf(h, 'r1')));
}
await closeDialog();
await openEditor('Supply Air');
await page.locator(`${M} [data-testid=nt-flow-sense]`).selectOption('supply');
await saveEditor();
await openRisers();
{
  const h = await heads();
  check(same(dirsOf(h, 'r1'), ['up', 'up']), 'B6 editor flip back to Supply: up, up', JSON.stringify(dirsOf(h, 'r1')));
}
await closeDialog();
// Pattern: Supply Air Dotted, Return Air Solid (a dotted lane next to a solid lane)
await openEditor('Supply Air');
await page.locator(`${M} select`).nth(1).selectOption({ label: 'Dotted' });
await saveEditor();
await openEditor('Return Air');
await page.locator(`${M} select`).nth(1).selectOption({ label: 'Solid' });
await saveEditor();
await openRisers();
{
  const h = await heads();
  const l1 = await laneDash('r1');
  const l2 = await laneDash('r2');
  console.log('LANE DASH r1', JSON.stringify(l1), 'r2', JSON.stringify(l2));
  check(l1.attr === '2 6' && (l2.attr === null || l2.attr === ''), 'B6 R1 lane dotted, R2 lane solid after the editor save', JSON.stringify([l1, l2]));
  check(h.length === 4 && h.every((x) => x.dash === 'none'), 'B6 the 4 heads stay solid on the dotted lane and on the solid lane', JSON.stringify(h.map((x) => [x.lane, x.dash])));
  await snap('b6-patterns', page.locator('.mep-rd'));
}
await closeDialog();
await openEditor('Supply Air');
await page.locator(`${M} select`).nth(1).selectOption({ label: 'Solid' });
await saveEditor();
await openEditor('Return Air');
await page.locator(`${M} select`).nth(1).selectOption({ label: 'Dashed' });
await saveEditor();

// ---------------------------------------------------------------- B7: small screens, a narrow window, the mouse wheel after Set by hand
async function fold(label, w, hgt) {
  await page.setViewportSize({ width: w, height: hgt });
  await idle(500);
  await openRisers();
  await pickLane('r1');
  const box = dlg.locator('[data-testid="riser-flow-box"]');
  const diagram = dlg.locator('.mep-rd');
  const info = {
    boxSeen: await seen(box),
    diagramSeen: await seen(diagram),
    boxRect: await box.boundingBox(),
    diagramRect: await diagram.boundingBox(),
  };
  console.log(`FOLD ${label}`, JSON.stringify(info));
  await snap(`b7-${label}`);
  return info;
}
await switchTo(t, 'l1.pdf');
cfg.sources1 = [];
cfg.sources2 = [0];
await applyAll(cfg);
const f1366 = await fold('1366x768', 1366, 768);
await dlg.locator('[data-testid="riser-set-by-hand"]').first().click();
await idle(800);
{
  const after = { diagramSeen: await seen(dlg.locator('.mep-rd')), diagramRect: await dlg.locator('.mep-rd').boundingBox() };
  console.log('AFTER SET BY HAND 1366x768', JSON.stringify(after));
  await snap('b7-1366x768-after-set-by-hand');
  const scroller = await dlg.evaluate((el) => {
    let n = el.querySelector('[data-testid="riser-flow-box"]');
    const out = [];
    while (n && n !== document.body) { const cs = getComputedStyle(n); if (/(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight) out.push({ cls: n.className, top: n.scrollTop, sh: n.scrollHeight, ch: n.clientHeight }); n = n.parentElement; }
    return out;
  });
  console.log('SCROLLERS', JSON.stringify(scroller));
  const box = await dlg.locator('.mep-rd').boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.max(5, box.y + 5 > 760 ? 400 : 400));
  await page.mouse.wheel(0, -2000);
  await idle(500);
  const afterWheel = { diagramSeen: await seen(dlg.locator('.mep-rd')) };
  console.log('AFTER WHEEL UP', JSON.stringify(afterWheel));
  check(afterWheel.diagramSeen === true, 'B7 after the wheel up (1366x768) the diagram is in view again', JSON.stringify(afterWheel));
  await dlg.locator('[data-testid="riser-use-solve"]').click();
  await idle(600);
}
await closeDialog();
cfg.sources1 = [0];
await applyAll(cfg);
await fold('1600x900', 1600, 900);
await closeDialog();
await fold('760x900', 760, 900);
{
  const lg = await dlg.locator('.mep-rd-legend').boundingBox();
  const df = await dlg.locator('.mep-rd-scroll').boundingBox();
  check(lg.y >= df.y + df.height - 1, 'B7 760 px: the legend is under the diagram', JSON.stringify({ lg, df }));
  const note = await boxText();
  check(note === 'Away from Level 0 · from the flow solve', 'B7 760 px: box text', note);
}
await closeDialog();
await page.setViewportSize({ width: 1600, height: 900 });
console.log('F1366 SUMMARY', JSON.stringify(f1366));

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
