// B8-T05: the riser arrows follow the live flow. Three levels from real PDFs, riser R1 (supply air) and R2 (return air).
// Setup (documents, scale, project JSON per level, building file) uses the scene API and the dev hook only.
// Real DOM: right-click and "Make riser", the document switcher, select and Delete of a source stamp, the network type editor (swatch, select, Save), the menu Save.
// Reading: scene.getRiserMarks() (arrows, color, pattern that reach the scene) and screenshots (read by eye).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t05-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, marksOf, waitMarks, applyLevel, screenOf, focusRings, LEVELS } from './b8-t05-lib.mjs';

const M = '.mep-modal';
const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot, menu, until, statusText } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');

const cfg = { withReturn: true, sources1: [], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
const exp = async (name, expected, what) => {
  const r = await waitMarks(page, expected, 4000);
  check(r.ok, `${name}: ${what}`, JSON.stringify(r.got));
  return r;
};
const saveDoc = async (label) => {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(600);
};

// ---------------------------------------------------------------- J1: make a riser by hand (real right-click), no arrows
await loadBuilding(t, buildingJson(uuids, anchors, { risers: false }));
{
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  await focusRings(page);
  const at = await screenOf(page, { x: 300, y: H - 300 });
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
  const item = page.locator('.mep-draw-from-menu button', { hasText: /Make riser/ }).first();
  const found = (await item.count()) > 0;
  check(found, 'J1: the right-click menu on the fitting has Make riser');
  if (found) {
    await item.click();
    await idle(1200);
    const marks = await marksOf(page);
    check(Object.keys(marks).length === 1 && marks.rf !== undefined, 'J1: one ring shows after Make riser', JSON.stringify(marks));
    check(marks.rf?.arrows === null, 'J1: the new riser has no arrows', JSON.stringify(marks.rf));
    await shot('B8-T05-j1-make-riser');
  }
}

// ---------------------------------------------------------------- the full building, no source anywhere: no arrows on any level
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));
for (const [i, level] of LEVELS.entries()) {
  await switchTo(t, level.name);
  await exp(`J1 level ${i}`, { rf: 'none', rf2: 'none' }, 'no source: no arrows on the rings');
}

// ---------------------------------------------------------------- J2 / J7: a source on level 0 for both risers
cfg.sources1 = [0];
cfg.sources2 = [0];
await applyLevel(t, 0, cfg);
await exp('J2 level 0', { rf: '2', rf2: '5' }, 'supply: goes up (2). return: comes down (5)');
await shot('B8-T05-source-level0-l0');
await switchTo(t, 'l1.pdf');
const m1 = await exp('J2 level 1', { rf: '1', rf2: '4' }, 'supply: comes up, goes up (1). return: comes down, goes down (4)');
check(m1.last.rf?.color === '#2196f3' && m1.last.rf?.pattern === 'solid', 'J2: R1 arrows have the color and pattern of Supply Air', JSON.stringify(m1.last.rf));
check(m1.last.rf2?.color === '#e53935' && m1.last.rf2?.pattern === 'dashed', 'J7: R2 arrows have the color and pattern of Return Air', JSON.stringify(m1.last.rf2));
await shot('B8-T05-source-level0-l1');
await switchTo(t, 'l2.pdf');
await exp('J2 level 2', { rf: '3', rf2: '6' }, 'supply: comes up (3). return: goes down (6)');
await shot('B8-T05-source-level0-l2');

// ---------------------------------------------------------------- J3: add a terminal on level 2: the arrows do not change
cfg.extra = [2];
await applyLevel(t, 2, cfg);
await idle(800);
await exp('J3 level 2', { rf: '3', rf2: '6' }, 'a new terminal changes no arrow');

// ---------------------------------------------------------------- J4: remove the source of R1 (real select and Delete on level 0)
await switchTo(t, 'l0.pdf');
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
check(await deleteStamp('src'), 'J4: the source stamp of R1 is gone after select and Delete');
await exp('J4 level 0', { rf: 'none', rf2: '5' }, 'R1 loses its arrows, R2 keeps them');
await switchTo(t, 'l1.pdf');
await exp('J4 level 1', { rf: 'none', rf2: '4' }, 'level 1: R1 none, R2 unchanged');
await shot('B8-T05-source-removed-r1');
await switchTo(t, 'l0.pdf');
check(await deleteStamp('src2'), 'J4: the source stamp of R2 is gone');
await exp('J4 level 0 b', { rf: 'none', rf2: 'none' }, 'no source left: no arrows');

// ---------------------------------------------------------------- J5: two sources
cfg.sources1 = [0, 2];
cfg.sources2 = [0];
await applyLevel(t, 0, cfg);
await applyLevel(t, 2, cfg);
await switchTo(t, 'l1.pdf');
await exp('J5 level 1', { rf: 'none', rf2: '4' }, 'two sources on R1: no arrows on R1, R2 still shows');
await shot('B8-T05-two-sources-none');
cfg.sources1 = [0];
await applyLevel(t, 2, cfg);
await switchTo(t, 'l1.pdf');
await exp('J5 back', { rf: '1', rf2: '4' }, 'one source again: the arrows come back');

// ---------------------------------------------------------------- source in the middle: pictogram 7 (supply) and 8 (return)
cfg.sources1 = [1];
cfg.sources2 = [1];
cfg.extra = [];
for (const i of [0, 2, 1]) await applyLevel(t, i, cfg);
await exp('J7 level 1', { rf: '7', rf2: '8' }, 'source on level 1: supply shows 7, return shows 8');
await shot('B8-T05-source-middle-supply-and-return');
await switchTo(t, 'l0.pdf');
await exp('J7 level 0', { rf: '5', rf2: '2' }, 'level 0: supply comes down (5), return goes up (2)');
await switchTo(t, 'l2.pdf');
await exp('J7 level 2', { rf: '3', rf2: '6' }, 'level 2: supply comes up (3), return goes down (6)');

// ---------------------------------------------------------------- J6: level 1 (the source) is not open
for (const i of [0, 1, 2]) {
  await switchTo(t, LEVELS[i].name);
  await saveDoc(LEVELS[i].name);
}
await page.evaluate(async () => {
  const read = async (sheet) => { try { return await (await (await navigator.storage.getDirectory()).getFileHandle(sheet.location.fileName)).getFile(); } catch { return undefined; } };
  await window.__mepBuilding.rebuildSummaries(read);
});
await idle(800);
await switchTo(t, 'l0.pdf');
await page.locator('.mep-doc-switcher-btn').click();
await page.locator('.mep-doc-switcher-dropdown .mep-doc-close[title="Close l1.pdf"]').click();
await idle(1500);
await page.keyboard.press('Escape');
const docs = await page.evaluate(() => window.__mepSketchScene.getDocuments().map((d) => d.fileName));
check(!docs.includes('l1.pdf') && docs.length === 2, 'J6: only level 0 and level 2 are open', JSON.stringify(docs));
await exp('J6 level 0', { rf: '5', rf2: '2' }, 'level 1 not open: the stored summary gives the same arrows on level 0');
await shot('B8-T05-level-not-open-l0');
await switchTo(t, 'l2.pdf');
await exp('J6 level 2', { rf: '3', rf2: '6' }, 'level 1 not open: the arrows of level 2');

// ---------------------------------------------------------------- page change: no flash
async function switchSampled(name, expectedLen) {
  await page.evaluate(() => {
    window.__samples = [];
    window.__iv = setInterval(() => {
      const list = [...window.__mepSketchScene.getRiserMarks().values()];
      window.__samples.push(list.map((m) => (m.arrows ? 1 : 0)).join(''));
    }, 8);
  });
  await switchTo(t, name);
  await page.waitForTimeout(700);
  const samples = await page.evaluate(() => {
    clearInterval(window.__iv);
    return window.__samples;
  });
  const flash = samples.filter((s) => s.includes('0'));
  check(samples.length > 20 && flash.length === 0, `page change to ${name}: no sample shows a ring without arrows (${samples.length} samples)`, JSON.stringify([...new Set(samples)]));
}
await switchSampled('l0.pdf');
await switchSampled('l2.pdf');
await switchSampled('l0.pdf');

// ---------------------------------------------------------------- J8 / J9: change Flow direction in the type editor (real DOM), no PDF save
const sel = () => page.locator(`${M} [data-testid=nt-flow-sense]`);
async function openEditor(name) {
  await page.locator('.mep-dock-tab-label', { hasText: /^MEP$/ }).click();
  await page.locator('button.mep-stamps-subtab-btn', { hasText: 'Network Types' }).click();
  await page.locator('.mep-discipline-btn', { hasText: 'HVAC' }).first().click();
  await idle(400);
  await page.locator('.mep-networktype-tile', { hasText: new RegExp(`^\\s*${name}\\s*`) }).first().locator('button[title="Edit"]').click();
  await page.locator(M).waitFor({ timeout: 20000 });
  await idle(300);
}
const buildingCopy = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json).risers.find((r) => r.id === 'r1')?.networkType.flowSense ?? null);
await switchTo(t, 'l0.pdf');
await exp('J8 before', { rf: '5', rf2: '2' }, 'start: supply comes down at level 0');
const flips = [['return', '2'], ['supply', '5'], ['return', '2']];
for (const [k, [value, pict]] of flips.entries()) {
  await openEditor('Supply Air');
  await sel().selectOption(value);
  await page.locator(M).getByRole('button', { name: /^Save$/ }).first().click();
  await idle(200);
  const r = await waitMarks(page, { rf: pict, rf2: '2' }, 2500);
  check(r.ok, `J${k === 0 ? 8 : 9} flip ${k + 1}: Flow direction ${value}: R1 shows ${pict} within 2.5 s, no PDF save`, JSON.stringify(r.got));
  await idle(500);
  check((await buildingCopy()) === value, `J${k === 0 ? 8 : 9} flip ${k + 1}: the copy of the type in the building file has ${value}`, String(await buildingCopy()));
  if (k === 0) await shot('B8-T05-after-editor-flip');
}
// D-B-130 B: the flow sense comes from the riser copy (the editor save updates it in the building file). The editor changed the type of the
// open drawing (Level 0) only. Level 2 keeps its own old copy of the type, but it must show the same direction for the riser: return, pictogram 6.
await switchTo(t, 'l2.pdf');
await exp('D-B-130 B level 2', { rf: '6', rf2: '6' }, 'after the flip on Level 0, Level 2 shows return arrows too (6), not the old supply arrows (3)');
await shot('B8-T05-after-editor-flip-l2');
check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
