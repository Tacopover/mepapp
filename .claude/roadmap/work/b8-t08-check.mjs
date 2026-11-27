// B8-T08: runs the steps of .claude/plans/buildings-b8-test.md that a headless Chromium can run, to check each UI word and each result in the script.
// Setup (documents, scale, project JSON per level, building file) uses the scene API and the dev hook only.
// Real DOM: type editor (swatch, select, Save), right-click menu, Properties, Manage Buildings, Risers tab, rail Undo, Tab key, Solve flow.
// Reading: scene.getRiserMarks() (arrows, color, pattern that reach the scene), the building file (__mepBuilding.read()), screenshots.
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t08-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, marksOf, waitMarks, applyLevel, screenOf, focusRings, LEVELS } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/shots-b8/';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const snap = async (name, clip) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot(clip ? { path, clip } : { path });
  console.log(`SHOT ${path}`);
};

// ---------------------------------------------------------------- Part 1: the editor, no building open
const sel = () => page.locator(`${M} [data-testid=nt-flow-sense]`);
async function openEditor(name, group = 'All') {
  await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
  await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
  await page.locator('.mep-discipline-btn', { hasText: new RegExp(`^${group}$`) }).first().click();
  await idle(300);
  await page.locator('.mep-networktype-tile', { hasText: new RegExp(`^\\s*${name}\\s*`) }).first().locator('button[title="Edit"]').click();
  await page.locator(M).waitFor({ timeout: 20000 });
  await idle(250);
}
await t.openPdf();
await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
await page.locator('.mep-discipline-btn', { hasText: /^All$/ }).first().click();
await idle(300);
const tileNames = (await page.locator('.mep-networktype-name').allInnerTexts()).map((x) => x.trim());
console.log('TILES', JSON.stringify(tileNames));
const DEFAULTS = {
  'Supply Air': 'supply', 'Return Air': 'return', 'Exhaust Air': 'return', 'Chilled Water': 'supply', 'Heating Water': 'supply',
  'Domestic Cold Water': 'supply', 'Domestic Hot Water': 'supply', 'Sanitary Waste': 'return', Conduit: 'supply', 'Cable Tray': 'supply',
  'Branch Circuit': 'supply', Feeder: 'supply', 'Wet Standpipe': 'supply', 'Dry Standpipe': 'supply',
};
check(Object.keys(DEFAULTS).every((n) => tileNames.includes(n)), '1: the Network Types list (filter All) shows the 14 library types', JSON.stringify(tileNames));
for (const [name, want] of Object.entries(DEFAULTS)) {
  await openEditor(name);
  const got = await sel().inputValue();
  check(got === want, `1: ${name} shows ${want} in the editor`, got);
  if (name === 'Supply Air') {
    const opts = await sel().locator('option').allInnerTexts();
    check(JSON.stringify(opts) === JSON.stringify(['Supply', 'Return']), '1: the two options read Supply and Return', JSON.stringify(opts));
    const label = (await page.locator(`${M} .mep-field-row`, { has: page.locator('[data-testid=nt-flow-sense]') }).locator('label').textContent())?.trim();
    check(label === 'Flow direction', '1: the label reads Flow direction', label);
    const sect = (await page.locator(`${M} .mep-nt-section-title`).innerText()).trim();
    console.log('SECTION TITLE', sect);
    await page.locator(`${M} [data-testid=nt-flow-sense-note] .mep-infotip`).hover();
    await idle(300);
    const tip = (await page.locator(`${M} [data-testid=nt-flow-sense-note] .mep-infotip-text`).innerText()).trim();
    check(tip === 'Supply goes away from the source. Return goes toward it. For the other direction of the same system, use Duplicate and change the copy.', '1: the hint text of the i mark', tip);
    const btns = await page.locator(`${M} .mep-modal-actions button, ${M} button`).allInnerTexts();
    console.log('BUTTONS', JSON.stringify(btns.map((x) => x.trim()).filter(Boolean)));
  }
  await page.keyboard.press('Escape');
  await idle(200);
}
// Duplicate: title, default name
await openEditor('Chilled Water');
await page.locator(M).getByRole('button', { name: /^Duplicate$/ }).click();
await idle(500);
const dupTitle = await page.locator(`${M} .mep-modal-title, ${M} h2, ${M} header`).first().innerText().catch(() => '');
const dupName = await page.locator(`${M} input[type=text]`).first().inputValue();
check(/Chilled Water_copy/.test(dupTitle) && dupName === 'Chilled Water_copy', '1: Duplicate opens the copy with the name Chilled Water_copy', `${dupTitle} | ${dupName}`);
await page.keyboard.press('Escape');
await idle(200);

// ---------------------------------------------------------------- Part 3 start: three levels, a building with two risers (supply-air R1 and return-air R2), no source
const cfg = { withReturn: true, sources1: [], sources2: [], extra: [] };
await page.locator('button.mep-stamps-subtab-btn', { hasText: /^Stamps$/ }).click();
await idle(300);
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
const exp = async (name, expected, what) => {
  const r = await waitMarks(page, expected, 4000);
  check(r.ok, `${name}: ${what}`, JSON.stringify(r.got));
  return r;
};
for (const [i, level] of LEVELS.entries()) {
  await switchTo(t, level.name);
  await exp(`3 no source level ${i}`, { rf: 'none', rf2: 'none' }, 'no arrows');
}

// source on the highest level (new case): supply R1: L2 = 6, L1 = 4, L0 = 5. return R2: L2 = 3, L1 = 1, L0 = 2.
cfg.sources1 = [2];
cfg.sources2 = [2];
for (const i of [0, 1, 2]) await applyLevel(t, i, cfg);
await exp('3 source on L2, level 2', { rf: '6', rf2: '3' }, 'supply goes down (6), return comes up (3)');
await snap('B8-T08-source-top-l2');
await switchTo(t, 'l1.pdf');
await exp('3 source on L2, level 1', { rf: '4', rf2: '1' }, 'supply comes down and goes down (4), return 1');
await switchTo(t, 'l0.pdf');
await exp('3 source on L2, level 0', { rf: '5', rf2: '2' }, 'supply comes down (5), return goes up (2)');
// source on the lowest level
cfg.sources1 = [0];
cfg.sources2 = [0];
for (const i of [2, 1, 0]) await applyLevel(t, i, cfg);
await exp('3 source on L0, level 0', { rf: '2', rf2: '5' }, 'supply 2, return 5');
await switchTo(t, 'l1.pdf');
await exp('3 source on L0, level 1', { rf: '1', rf2: '4' }, 'supply 1, return 4');
await switchTo(t, 'l2.pdf');
await exp('3 source on L0, level 2', { rf: '3', rf2: '6' }, 'supply 3, return 6');

// ---------------------------------------------------------------- Part 2: pattern from the editor (real DOM) and zoom
await switchTo(t, 'l1.pdf');
await openEditor('Supply Air');
const selects = page.locator(`${M} select`);
const patternSelect = selects.nth(1);
const patternOptions = await patternSelect.locator('option').allInnerTexts();
console.log('PATTERNS', JSON.stringify(patternOptions));
await patternSelect.selectOption({ label: 'Dotted' });
await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
await idle(500);
{
  const r = await marksOf(page);
  check(r.rf?.pattern === 'dotted' && r.rf2?.pattern === 'dashed', '2: Supply Air set to Dotted: the arrows of R1 are dotted, R2 stays dashed', JSON.stringify(r));
}
const zoomRing = async (z, name) => {
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
  await idle(500);
  const zoomText = (await page.locator('.mep-zoom-reset').innerText()).trim();
  const at = await screenOf(page, { x: 300, y: (await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt)) - 300 });
  const half = Math.max(120, Math.min(330, Math.round(80 * z + 120)));
  await snap(name, { x: Math.max(0, at.x - half), y: Math.max(0, at.y - half), width: 2 * half, height: 2 * half });
  return zoomText;
};
for (const [z, name] of [[0.25, 'zoom-25'], [1, 'zoom-100'], [2, 'zoom-200'], [4, 'zoom-400']]) {
  const text = await zoomRing(z, `B8-T08-${name}`);
  check(text === `${Math.round(z * 100)}%`, `2: the status bar shows the zoom ${name}`, text);
}
await focusRings(page);
// put the pattern back
await openEditor('Supply Air');
await page.locator(`${M} select`).nth(1).selectOption({ label: 'Solid' });
await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
await idle(400);

// ---------------------------------------------------------------- Part 3: two sources, the warning words, Properties, Risers tab
cfg.sources1 = [0, 2];
cfg.sources2 = [0];
await applyLevel(t, 0, cfg);
await applyLevel(t, 2, cfg);
await switchTo(t, 'l1.pdf');
await exp('3 two sources', { rf: 'none', rf2: '4' }, 'two sources on R1: no arrows on R1');
{
  const dlg = page.locator(M);
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
  const tabs = await dlg.getByRole('tab').allInnerTexts();
  console.log('TABS', JSON.stringify(tabs));
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  const w = await dlg.locator('[data-testid="riser-warnings"]').innerText().catch(() => '(none)');
  console.log('WARNINGS', JSON.stringify(w.replace(/\s+/g, ' ')));
  await snap('B8-T08-two-sources-risers-tab');
  await page.keyboard.press('Escape');
  await idle(400);
}
cfg.sources1 = [0];
await applyLevel(t, 2, cfg);
await switchTo(t, 'l1.pdf');
await exp('3 back to one source', { rf: '1', rf2: '4' }, 'one source again');

// ---------------------------------------------------------------- Part 4: hand-set pair: menu text, Properties, Undo, Tab order, menu near the edge
const ringPt = async (which) => { const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt); return { x: 300, y: H - (which === 'R1' ? 300 : 520) }; };
const menuLoc = page.locator('.mep-draw-from-menu');
async function rightClick(which, at) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await focusRings(page);
  const p = at ?? (await screenOf(page, await ringPt(which)));
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await idle(400);
}
await rightClick('R1');
{
  const items = await menuLoc.locator('button').allInnerTexts();
  console.log('MENU BUTTONS', JSON.stringify(items.map((x) => x.replace(/\s+/g, ' ').trim())));
  console.log('MENU HEADING', JSON.stringify(await menuLoc.locator('.mep-draw-from-menu-heading').allInnerTexts()));
  const titles = await menuLoc.locator('[role=radio]').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  console.log('MENU TITLES', JSON.stringify(titles));
  const solve = await menuLoc.locator('[data-testid="riser-arrow-solve"]').getAttribute('title');
  console.log('SOLVE TITLE', solve);
  const kinds = await page.evaluate(() => [...document.querySelectorAll('.mep-draw-from-menu .mep-draw-from-menu-sep')].length);
  console.log('SEPARATORS', kinds);
  await snap('B8-T08-menu');
}
await page.keyboard.press('Escape');
await idle(300);
// menu near the bottom right corner
{
  const vp = page.viewportSize();
  const canvas = await page.evaluate(() => { const r = window.__mepSketchScene.app.canvas.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  // move the view so that the ring sits 12 px from the bottom right corner of the canvas
  await page.evaluate(([c]) => {
    const s = window.__mepSketchScene;
    const H = s.getDisplayedPageSize().heightPt;
    const z = s.world.scale.x;
    const w = { x: 300, y: H - 300 };
    s.world.x = (c.r - c.l - 12) - w.x * z;
    s.world.y = (c.b - c.t - 12) - w.y * z;
    s.zoomBy(1);
  }, [canvas]);
  await idle(400);
  const at = await screenOf(page, await ringPt('R1'));
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
  const box = await menuLoc.boundingBox();
  check(box !== null && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, '4: the menu opened 12 px from the bottom right corner of the canvas stays inside the window', JSON.stringify({ box, at }));
  await snap('B8-T08-menu-corner');
  await page.keyboard.press('Escape');
  await idle(300);
}
await focusRings(page);
// set pictogram 2 by the menu, then Undo
await rightClick('R1');
await menuLoc.locator('[data-testid="riser-arrow-p2"]').click();
await idle(700);
await exp('4 hand-set 2', { rf: '2' }, 'the ring of R1 shows pictogram 2 (goes up) from the menu');
await page.locator('button.mep-rail-btn[title="Undo"]').click();
await idle(500);
await exp('4 after Undo', { rf: '2' }, 'the rail Undo does not change the hand-set arrows');
// Properties and tab order
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
  console.log('PROPS ROWS', JSON.stringify((await sect.locator('.mep-field-row').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim())));
  console.log('PROPS HINTS', JSON.stringify(await sect.locator('.mep-hint').allInnerTexts()));
  await snap('B8-T08-properties-hand');
  // count the Tab presses from the canvas click to the picker
  let count = 0;
  let found = false;
  for (let i = 1; i <= 80; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[data-testid="riser-arrow-picker"]'));
    if (inside) { count = i; found = true; break; }
  }
  console.log('TAB COUNT to the picker (Properties already open, after a click on the ring)', found ? count : 'not found in 80');
  const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  console.log('FOCUSED', focused);
}
// back to the flow solve
await page.locator('[data-testid="riser-arrow-solve"]').click();
await idle(600);
await exp('4 solve again', { rf: '1' }, 'Use the flow solve');

// ---------------------------------------------------------------- Part 5: Solve flow, arrowhead of a segment (supply and return), screenshot
const midOf = (id) => page.evaluate((id) => { const s = window.__mepSketchScene.exportProject().segments.find((x) => x.id === id); const a = s.geometry[0]; const b = s.geometry[s.geometry.length - 1]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }, id);
async function clickSegment(id) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  const at = await screenOf(page, await midOf(id));
  await page.mouse.click(at.x, at.y);
  await idle(400);
}
await switchTo(t, 'l0.pdf');
await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
await idle(300);
await page.locator('button.mep-icon-btn', { hasText: /Solve flow/ }).click();
await idle(400);
await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
await clickSegment('s2');
{
  const text = await page.evaluate(() => { const g = window.__mepSketchScene.doc.flowLabelLayer.children; return g.filter((c) => 'text' in c).map((c) => c.text); });
  console.log('FLOW LABELS', JSON.stringify(text));
  const n = await page.evaluate(() => window.__mepSketchScene.doc.flowLabelLayer.children.filter((c) => !('text' in c)).length);
  check(n === 1, '5: after Solve flow and a click on a segment, one arrowhead graphic shows for the network', String(n));
  await focusRings(page);
  await snap('B8-T08-arrowheads-l0');
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
