// B8-T06: choose a riser arrow pictogram by hand. Three levels from real PDFs, riser R1 (supply air, source on level 0) and R2 (return air, no source).
// Setup (documents, scale, project JSON per level, building file) uses the scene API and the dev hook only.
// Real DOM: real right-click on the ring, real clicks on the picker cells, real keyboard in Properties, Manage Buildings, Risers tab.
// Reading: scene.getRiserMarks() (the arrows that reach the scene), the building file (__mepBuilding.read()) and screenshots (read by eye).
// Run: node .claude/roadmap/browser/with-server.mjs .claude/roadmap/work/b8-t06-check.mjs
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, marksOf, waitMarks, screenOf, focusRings, PICT, pictOf } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const TITLES = {
  1: 'Comes up, goes up', 2: 'Goes up', 3: 'Comes up', 4: 'Comes down, goes down',
  5: 'Comes down', 6: 'Goes down', 7: 'Goes up, goes down', 8: 'Comes up, comes down',
};
const WARN = (name, a, b) => `Arrows of ${name} disagree on the span ${a} to ${b}. Change the arrows on one of the two levels.`;

const t = await open({ seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot, menu } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
check((await page.evaluate(() => localStorage.getItem('mepapp.devPlatform'))) === null, 'devPlatform flag is not set');

const cfg = { withReturn: true, sources1: [0], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfg);
await loadBuilding(t, buildingJson(uuids, anchors, { withReturn: true }));

const exp = async (name, expected, what) => {
  const r = await waitMarks(page, expected, 4000);
  check(r.ok, `${name}: ${what}`, JSON.stringify(r.got));
  return r;
};
const stored = async () => JSON.parse(await page.evaluate(async () => (await window.__mepBuilding.read()).json));
const storedPair = async (riserId, levelId) => (await stored()).risers.find((r) => r.id === riserId).members.find((m) => m.levelId === levelId).arrows ?? null;
const R1 = 'R1';
const R2 = 'R2';
const ringPt = async (which) => { const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt); return { x: 300, y: H - (which === 'R1' ? 300 : 520) }; };
const menuLoc = page.locator('.mep-draw-from-menu');
const toasts = () => page.locator('.mep-toast').allInnerTexts();

async function rightClick(p) {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await focusRings(page);
  const at = await screenOf(page, await ringPt(p));
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
}
async function chooseFromMenu(p, testid) {
  await rightClick(p);
  await page.locator(`.mep-draw-from-menu [data-testid="${testid}"]`).click();
  await idle(700);
}

// ---------------------------------------------------------------- K1 / menu content, on level 1 (middle member)
await switchTo(t, 'l1.pdf');
await exp('start level 1', { rf: '1', rf2: 'none' }, 'R1 shows pictogram 1 from the solve, R2 has no arrows');
await rightClick(R1);
{
  check((await menuLoc.count()) === 1, 'K1: the right-click menu opens on the ring');
  check((await menuLoc.locator('.mep-draw-from-menu-heading', { hasText: /^Riser arrows$/ }).count()) === 1, 'K1: the menu has the heading "Riser arrows"');
  const radios = menuLoc.locator('[role=radio]');
  check((await radios.count()) === 9, 'K1: the picker has nine radio items', String(await radios.count()));
  const titles = await menuLoc.locator('.mep-arrow-cell').evaluateAll((els) => els.map((e) => e.getAttribute('title')));
  check(JSON.stringify(titles) === JSON.stringify(Object.values(TITLES)), 'K1: the eight tooltips are the eight texts in the order of the picture', JSON.stringify(titles));
  check((await menuLoc.locator('[data-testid="riser-arrow-none"]').innerText()).includes('No arrows'), 'K1: item "No arrows"');
  const solve = menuLoc.locator('[data-testid="riser-arrow-solve"]');
  check((await solve.innerText()).includes('Use the flow solve'), 'K1: item "Use the flow solve"');
  check((await solve.getAttribute('aria-disabled')) === 'true', 'K1: "Use the flow solve" is dim while the ring follows the solve');
  check((await menuLoc.locator('[aria-checked=true]').count()) === 0, 'K1: no pictogram is marked while the ring follows the solve');
  check((await menuLoc.locator('button', { hasText: /^\s*Detach from riser\s*$/ }).count()) === 1, 'K1: Detach from riser stays in the menu');
  const box = await menuLoc.boundingBox();
  const vp = page.viewportSize();
  check(box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height, 'K1: the menu is inside the window', JSON.stringify(box));
  const cells = await menuLoc.locator('.mep-arrow-cell').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check(cells.every(([w, h]) => w === 36 && h === 36), 'K1: each cell is 36 x 36 px', JSON.stringify(cells));
  await shot('B8-T06-menu-picker');
}
await page.keyboard.press('Escape');
await idle(300);

// ---------------------------------------------------------------- each of the eight pictograms by hand (level 1, real clicks)
for (let n = 1; n <= 8; n++) {
  await chooseFromMenu(R1, `riser-arrow-p${n}`);
  await exp(`pictogram ${n}`, { rf: String(n) }, `the ring shows pictogram ${n} (${TITLES[n]})`);
  const pair = await storedPair('r1', 'l1');
  check(JSON.stringify(pair) === JSON.stringify(PICT[n]), `pictogram ${n}: the building file holds the pair`, JSON.stringify(pair));
  check((await toasts()).length === 0 || !(await toasts()).some((x) => /disagree/.test(x)), `pictogram ${n}: a lone hand-set ring gives no warning`);
  await shot(`B8-T06-hand-p${n}`);
}
// the menu shows the chosen cell
await rightClick(R1);
{
  const checkedTitle = await menuLoc.locator('.mep-arrow-cell[aria-checked=true]').getAttribute('title');
  check(checkedTitle === TITLES[8], 'the chosen picture is marked in the menu', String(checkedTitle));
  const solve = menuLoc.locator('[data-testid="riser-arrow-solve"]');
  check((await solve.getAttribute('aria-disabled')) === null, '"Use the flow solve" is on while a pictogram is set by hand');
  await shot('B8-T06-menu-chosen');
}
await page.keyboard.press('Escape');
await idle(300);

// ---------------------------------------------------------------- the same choice twice writes nothing
{
  const before = await page.evaluate(async () => (await window.__mepBuilding.read()).json);
  await chooseFromMenu(R1, 'riser-arrow-p8');
  const after = await page.evaluate(async () => (await window.__mepBuilding.read()).json);
  check(before === after, 'the same choice again changes nothing in the building file');
  check((await toasts()).length === 0, 'the same choice again shows no text', JSON.stringify(await toasts()));
}

// ---------------------------------------------------------------- "No arrows"
await chooseFromMenu(R1, 'riser-arrow-none');
await exp('no arrows', { rf: 'none' }, 'No arrows: the ring shows no arrow');
check(JSON.stringify(await storedPair('r1', 'l1')) === JSON.stringify({ below: 'none', above: 'none' }), 'No arrows: the file holds (none, none)', JSON.stringify(await storedPair('r1', 'l1')));
await rightClick(R1);
check((await menuLoc.locator('[data-testid="riser-arrow-none"]').getAttribute('aria-checked')) === 'true', 'No arrows is marked in the menu');
await page.keyboard.press('Escape');
await idle(300);

// ---------------------------------------------------------------- "Use the flow solve"
await chooseFromMenu(R1, 'riser-arrow-solve');
await exp('use the solve', { rf: '1' }, 'Use the flow solve: the ring shows the solve again (pictogram 1)');
check((await storedPair('r1', 'l1')) === null, 'Use the flow solve: the field arrows is removed from the file');

// ---------------------------------------------------------------- K2 / K8: Properties, three states of the row, keyboard
await page.locator('button.mep-rail-btn[title="Select"]').click();
await focusRings(page);
{
  const at = await screenOf(page, await ringPt(R1));
  await page.mouse.click(at.x, at.y);
  await idle(500);
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(400);
  const row = page.locator('[data-testid="props-riser-arrows"]');
  check((await row.count()) === 1 && (await row.innerText()).trim() === 'From the flow solve', 'K2: Properties row Arrows says "From the flow solve"', await row.allInnerTexts().then(String));
  check((await page.locator('[data-testid="props-riser-arrows-hint"]').innerText()).trim() === 'Up and down mean higher and lower levels.', 'K2: the hint line');
  await shot('B8-T06-props-solve');
  await page.locator('[data-testid="riser-arrow-picker"] [data-testid="riser-arrow-p5"]').click();
  await idle(700);
  await exp('props click', { rf: '5' }, 'K2: a click on "Comes down" in Properties sets pictogram 5');
  check((await row.innerText()).trim() === 'Set by hand', 'K2: the row says "Set by hand"');
  check((await page.locator('[data-testid="riser-arrow-picker"] [data-testid="riser-arrow-p5"]').getAttribute('aria-checked')) === 'true', 'K2: the chosen cell is marked and the picker stays open');
  await shot('B8-T06-props-hand');
  // K8: keyboard. Focus goes to the chosen item with Tab; Right x2 moves focus only; Space writes.
  const before = await page.evaluate(async () => (await window.__mepBuilding.read()).json);
  await page.locator('[data-testid="riser-arrow-p5"]').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await idle(300);
  check((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'riser-arrow-p7', 'K8: Right arrow twice moves the focus to the third item after p5 (p7)');
  check((await page.evaluate(async () => (await window.__mepBuilding.read()).json)) === before, 'K8: moving the focus writes nothing');
  await page.keyboard.press('Space');
  await idle(700);
  await exp('props keyboard', { rf: '7' }, 'K8: Space on the focused item sets pictogram 7');
  check((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'riser-arrow-p7', 'K8: the focus stays on the chosen item after the write');
  await page.keyboard.press('ArrowDown');
  check((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'riser-arrow-none', 'K8: Down arrow from the second row goes to "No arrows"');
  await page.keyboard.press('Enter');
  await idle(700);
  await exp('props keyboard none', { rf: 'none' }, 'K8: Enter on "No arrows" sets no arrows');
  await page.keyboard.press('Tab');
  check((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'riser-arrow-solve', 'K8: Tab leaves the group and goes to "Use the flow solve"');
  await page.keyboard.press('Enter');
  await idle(700);
  await exp('props keyboard solve', { rf: '1' }, 'K8: Enter on "Use the flow solve" goes back to the solve');
  check((await row.innerText()).trim() === 'From the flow solve', 'K3: the row says "From the flow solve" again');
}

// ---------------------------------------------------------------- the row says "None yet" for R2 (no source anywhere)
{
  const at = await screenOf(page, await ringPt(R2));
  await page.mouse.click(at.x, at.y);
  await idle(500);
  const row = page.locator('[data-testid="props-riser-arrows"]');
  check((await row.innerText()).trim() === 'None yet', 'the row says "None yet" for a ring with no arrows from the solve', await row.allInnerTexts().then(String));
  await shot('B8-T06-props-none-yet');
}

// ---------------------------------------------------------------- K6: two rings that disagree: toast, Risers tab warning, tag in the row
await chooseFromMenu(R1, 'riser-arrow-p6'); // level 1: goes down (below down, above none)
await switchTo(t, 'l0.pdf');
await chooseFromMenu(R1, 'riser-arrow-p2'); // level 0: goes up (above up) -> disagrees with level 1 below down
{
  const texts = await toasts();
  check(texts.some((x) => x.includes(WARN('R1', 'Level 0', 'Level 1'))), 'K6: a toast shows the warning with the riser name', JSON.stringify(texts));
  await shot('B8-T06-warning-toast');
}
// R2 gets the same disagreement: two different lines
await chooseFromMenu(R2, 'riser-arrow-p2');
await switchTo(t, 'l1.pdf');
await chooseFromMenu(R2, 'riser-arrow-p6');
{
  const texts = await toasts();
  check(texts.some((x) => x.includes(WARN('R2', 'Level 0', 'Level 1'))), 'K6: R2 gives its own line with its own name', JSON.stringify(texts));
}
const dlg = page.locator('.mep-modal');
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(600);
await dlg.getByRole('tab', { name: /^Risers/ }).click();
await idle(900);
{
  const w = await dlg.locator('[data-testid="riser-warnings"]').innerText();
  check(w.includes(WARN('R1', 'Level 0', 'Level 1')) && w.includes(WARN('R2', 'Level 0', 'Level 1')), 'K6: the Risers tab lists two different warning lines', w.replace(/\s+/g, ' '));
  const rows = await dlg.locator('[data-testid="riser-row"]').allInnerTexts();
  const tags = await dlg.locator('[data-testid="riser-row-arrows-tag"]').allInnerTexts();
  check(tags.length === 2 && tags.every((x) => x.trim() === 'Arrows set by hand'), 'K7: two rows show the line "Arrows set by hand" (levels 0 and 1)', JSON.stringify(rows));
  const clipped = await dlg.locator('[data-testid="riser-row-arrows-tag"]').evaluateAll((els) => els.map((e) => { const p = e.closest('.mep-rp-level').getBoundingClientRect(); const r = e.getBoundingClientRect(); return e.scrollWidth > e.clientWidth + 1 || r.right > p.right + 1 || r.bottom > p.bottom + 1; }));
  check(clipped.length === 2 && clipped.every((x) => !x), 'K7: the tag "Arrows set by hand" is shown in full (not cut)', JSON.stringify(clipped));
  const names = await dlg.locator('[data-testid="riser-row"]').evaluateAll((els) => els.map((e) => e.querySelector('.mep-rp-level')?.firstChild?.textContent?.trim()));
  check(JSON.stringify(names) === JSON.stringify(['Level 2', 'Level 1', 'Level 0']), 'K7: the order of the rows is unchanged (highest level first)', JSON.stringify(names));
  await shot('B8-T06-risers-tab-tag');
}
await page.keyboard.press('Escape');
await idle(500);

// ---------------------------------------------------------------- a hand-set pair survives a page change and a save and reload of the building file
{
  const json = await page.evaluate(async () => (await window.__mepBuilding.read()).json);
  await switchTo(t, 'l2.pdf');
  await switchTo(t, 'l0.pdf');
  await exp('after page changes', { rf: '2' }, 'the hand-set pair on level 0 survives page changes');
  await switchTo(t, 'l1.pdf');
  await exp('after page changes l1', { rf: '6' }, 'the hand-set pair on level 1 survives page changes');
  // reload of the building file: load the file that was written
  await page.evaluate(async (j) => { await window.__mepBuilding.load(j); }, json);
  await idle(1200);
  await exp('after reload l1', { rf: '6', rf2: '6' }, 'after the building file is loaded again, level 1 keeps both pairs');
  await switchTo(t, 'l0.pdf');
  await exp('after reload l0', { rf: '2', rf2: '2' }, 'after the building file is loaded again, level 0 keeps both pairs');
  check(/"arrows"/.test(json), 'the file text holds the field arrows');
}

// ---------------------------------------------------------------- "Use the flow solve" on the three rings, then a dashed ring has no picker
for (const [lvl, riser, p] of [['l0.pdf', 'rf', R1], ['l0.pdf', 'rf2', R2]]) {
  await switchTo(t, lvl);
  await chooseFromMenu(p, 'riser-arrow-solve');
}
await switchTo(t, 'l1.pdf');
await chooseFromMenu(R1, 'riser-arrow-solve');
await chooseFromMenu(R2, 'riser-arrow-solve');
check(JSON.stringify((await stored()).risers.map((r) => r.members.map((m) => m.arrows ?? null))) === JSON.stringify([[null, null, null], [null, null, null]]), 'all hand-set pairs are cleared in the file');

// a riser with members on level 0 and 1 only: level 2 shows a dashed ring
{
  const file = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
  file.risers[0].members = file.risers[0].members.filter((m) => m.levelId !== 'l2');
  await page.evaluate(async (j) => { await window.__mepBuilding.load(j); }, JSON.stringify(file));
  await idle(1200);
  await switchTo(t, 'l2.pdf');
  await rightClick(R1);
  const items = await menuLoc.locator('button').allInnerTexts();
  check(items.some((x) => /Draw from/.test(x)) && (await menuLoc.locator('[data-testid="riser-arrow-picker"]').count()) === 0, 'a dashed ring: the menu has Draw from and no picker', JSON.stringify(items));
  check((await menuLoc.locator('.mep-draw-from-menu-heading').count()) === 0, 'a dashed ring: no heading "Riser arrows"');
  await shot('B8-T06-dashed-menu');
  await page.keyboard.press('Escape');
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
