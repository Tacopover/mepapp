// B8-T06 journey tester: goals G1 to G6 played as a first-time user. Args: <width> <empty|full>.
// Setup (documents, building file) uses the scene API and the dev hook. Every user action is a real mouse or keyboard action.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/browser/lib.mjs';
import { setup, buildingJson, loadBuilding, switchTo, focusRings, screenOf, marksOf, waitMarks, PICT } from '/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs';

const width = Number(process.argv[2] ?? 1600);
const state = process.argv[3] ?? 'empty';
const height = width < 900 ? 800 : 900;
const tag = `${width}-${state}`;
const t = await open({ width, height, seed: { 'mepapp.realStore': '1' } });
const { page, check, idle, shot, menu } = t;
const sh = (n) => shot(`B8-T06-journey-${n}-${tag}`);
await t.start();

const cfgSetup = { withReturn: true, sources1: [0], sources2: [], extra: [] };
const { uuids, anchors } = await setup(t, cfgSetup);
const longName = (s) => (s + ' ' + 'abcdefghij klmnopqrs tuvwxyz '.repeat(4)).slice(0, 80).trim();
function makeFile(opts = {}) {
  const file = JSON.parse(buildingJson(uuids, anchors, { withReturn: true }));
  if (state === 'full') {
    file.levels = [0, 1, 2].map((i) => ({ id: `l${i}`, name: longName(`Level ${i}`), elevationMm: i * 3000 }));
    for (let i = 3; i < 30; i++) file.levels.push({ id: `l${i}`, name: longName(`Level ${i}`), elevationMm: i * 3000 });
    file.risers[0].name = longName('R1 supply');
    file.risers[1].name = longName('R2 return');
    const set = (r, i, n) => { file.risers[r].members[i].arrows = PICT[n]; };
    set(0, 0, 2); set(0, 1, 1); set(0, 2, 3);
    set(1, 0, 2); set(1, 1, 6);
  }
  if (opts.dashedL2) file.risers[0].members = file.risers[0].members.filter((m) => m.levelId !== 'l2');
  return file;
}
await loadBuilding(t, JSON.stringify(makeFile()));
const readFile = async () => JSON.parse(await page.evaluate(async () => (await window.__mepBuilding.read()).json));
const storedPair = async (rid, lid) => (await readFile()).risers.find((r) => r.id === rid).members.find((m) => m.levelId === lid).arrows ?? null;
const pictOf = (a) => (!a ? 'none' : (Object.entries(PICT).find(([, v]) => v.below === a.below && v.above === a.above)?.[0] ?? '?'));

let steps = 0;
const S = (what) => { steps++; console.log(`  STEP ${steps}: ${what}`); };
const result = {};
async function goal(name, fn) {
  steps = 0;
  console.log(`=== ${name} (${tag})`);
  try { await fn(); } catch (e) { console.log(`  ERROR in ${name}: ${String(e).split('\n')[0]}`); check(false, `${name} ran to the end`, String(e).split('\n')[0]); await sh(`${name}-error`).catch(() => {}); }
  result[name] = steps;
  console.log(`GOAL ${name} STEPS ${steps}`);
}
const menuLoc = page.locator('.mep-draw-from-menu');
const ringPt = async (which) => { const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt); return { x: 300, y: H - (which === 'R1' ? 300 : 520) }; };
async function rightClickRing(which, where) {
  const at = where ?? await screenOf(page, await ringPt(which));
  S(`right-click the ring ${which}`);
  await page.mouse.click(at.x, at.y, { button: 'right' });
  await idle(400);
}
async function leftClickRing(which) {
  const at = await screenOf(page, await ringPt(which));
  S(`click the ring ${which}`);
  await page.mouse.click(at.x, at.y);
  await idle(500);
}
const radioIn = (scope, name) => scope.getByRole('radio', { name, exact: true });
async function pickMenu(name) {
  S(`click "${name}" in the menu`);
  await radioIn(menuLoc, name).click();
  await idle(700);
}
async function pickNone() { S('click "No arrows" in the menu'); await menuLoc.getByRole('radio', { name: 'No arrows' }).click(); await idle(700); }
async function pickSolveMenu() { S('click "Use the flow solve" in the menu'); await menuLoc.getByText('Use the flow solve').click(); await idle(700); }
const toasts = () => page.locator('.mep-toast').allInnerTexts();
async function pinRing(which, fromRight, fromBottom) {
  await page.evaluate(async ([p, fr, fb]) => {
    const s = window.__mepSketchScene;
    const H = s.getDisplayedPageSize().heightPt;
    const r = s.app.canvas.getBoundingClientRect();
    const w = p;
    const dockLeft = document.querySelector('.mep-dock')?.getBoundingClientRect().left ?? r.right;
    const x = Math.min(r.right, dockLeft) - fr;
    const y = r.bottom - fb;
    s.world.scale.set(1);
    s.world.x = x - r.left - w.x;
    s.world.y = y - r.top - (H - w.y);
    s.zoomBy(1);
  }, [{ x: 300, y: 300 }, fromRight, fromBottom]);
  await page.waitForTimeout(300);
}

async function menuWhole(label) {
  const vp = page.viewportSize();
  const box = await menuLoc.boundingBox();
  const inside = box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width && box.y + box.height <= vp.height;
  const items = await menuLoc.locator('[role=radio], button, [role=menuitem]').evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { label: e.getAttribute('aria-label') ?? e.innerText.trim(), visible: r.right <= window.innerWidth && r.bottom <= window.innerHeight && r.left >= 0 && r.top >= 0, reachable: !!top && (e === top || e.contains(top) || top.contains(e)) };
  }));
  const bad = items.filter((i) => !i.visible || !i.reachable);
  check(inside && bad.length === 0 && items.length >= 12, `${label}: whole menu inside the window and every cell reachable`, JSON.stringify({ box, count: items.length, bad }));
}

// ---------------------------------------------------------------- G1
await goal('G1', async () => {
  await switchTo(t, 'l1.pdf');
  await sh('G1-start');
  await rightClickRing('R1');
  await sh('G1-menu');
  await pickMenu('Goes up');
  const r = await waitMarks(page, { rf: '2' }, 3000);
  check(r.ok, 'G1: the ring shows "goes up" only', JSON.stringify(r.got));
  check(pictOf(await storedPair('r1', 'l1')) === '2', 'G1: the file holds pictogram 2');
  await sh('G1-result');
  console.log('  toasts after G1:', JSON.stringify(await toasts()));
});

// G1 repeat: three rings in a row, then the same choice again, then a dim item
await goal('G1-repeat3', async () => {
  for (const lvl of ['l0.pdf', 'l1.pdf', 'l2.pdf']) {
    await switchTo(t, lvl);
    await rightClickRing('R1');
    await pickMenu('Comes down');
  }
  const r2 = await waitMarks(page, { rf: '5' }, 3000);
  check(r2.ok, 'G1 repeat: level 2 ring shows pictogram 5', JSON.stringify(r2.got));
  console.log('  toasts after 3 rings:', JSON.stringify(await toasts()));
  await sh('G1-repeat-3');
  // same choice again
  const before = JSON.stringify(await readFile());
  await rightClickRing('R1');
  await pickMenu('Comes down');
  check(before === JSON.stringify(await readFile()), 'G1 repeat: same choice again writes nothing');
  // dim item
  await rightClickRing('R1');
  await menuLoc.getByText('Use the flow solve').click({ force: true });
  await idle(500);
  console.log('  after clicking the (live) solve item, menu open:', await menuLoc.count());
  // empty-selection style: right-click on empty canvas
  const vp = page.viewportSize();
  await page.mouse.click(120, 400, { button: 'right' });
  await idle(400);
  console.log('  menu on empty canvas:', JSON.stringify(await menuLoc.allInnerTexts()), await page.locator('.mep-context-menu, [role=menu]').count());
  await sh('G1-empty-canvas-menu');
  await page.keyboard.press('Escape');
  await idle(300);
  // clean: all three rings back to the solve for the next goal
  for (const lvl of ['l0.pdf', 'l1.pdf', 'l2.pdf']) {
    await switchTo(t, lvl);
    await rightClickRing('R1');
    await menuLoc.getByText('Use the flow solve').click({ force: true });
    await idle(600);
  }
  if (state === 'full') { await page.evaluate(async (j) => { await window.__mepBuilding.load(j); }, JSON.stringify(makeFile())); await idle(1000); }
});

// ---------------------------------------------------------------- G2
await goal('G2', async () => {
  await switchTo(t, 'l1.pdf');
  await leftClickRing('R1');
  console.log('  active dock tab after click:', JSON.stringify(await page.locator('.mep-dock-tab.on').allInnerTexts()));
  await sh('G2-selected');
  // keyboard only from here
  const focusInfo = () => page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName} role=${e.getAttribute('role')} label=${e.getAttribute('aria-label') ?? e.innerText?.slice(0, 30)}` : 'none'; });
  console.log('  focus at start:', await focusInfo());
  let tabs = 0;
  while (tabs < 120) {
    const ok = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'radio');
    if (ok) break;
    await page.keyboard.press('Tab');
    tabs++;
    steps++;
  }
  console.log(`  STEP ...: pressed Tab ${tabs} times to reach the picker; focus now: ${await focusInfo()}`);
  result['G2-tabs-to-picker'] = tabs;
  await sh('G2-focus-on-picker');
  // target: "Goes up" = pictogram 2. Move with arrow keys until the focused radio is named "Goes up".
  let moves = 0;
  while (moves < 12) {
    const name = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    if (name === 'Goes up') break;
    await page.keyboard.press('ArrowRight');
    steps++;
    moves++;
  }
  console.log(`  arrow presses: ${moves}`);
  S('press Space');
  await page.keyboard.press('Space');
  await idle(700);
  const r = await waitMarks(page, { rf: '2' }, 3000);
  check(r.ok, 'G2: keyboard choice shows "goes up" on the ring', JSON.stringify(r.got));
  await sh('G2-result');
  console.log('  focus after Space:', await focusInfo());
  // back to the flow solve by keyboard
  let more = 0;
  while (more < 6) {
    const txt = await page.evaluate(() => document.activeElement?.innerText?.trim());
    if (/Use the flow solve/.test(txt ?? '')) break;
    await page.keyboard.press('Tab');
    steps++;
    more++;
  }
  console.log(`  Tab presses to "Use the flow solve": ${more}; focus: ${await focusInfo()}`);
  S('press Enter');
  await page.keyboard.press('Enter');
  await idle(700);
  const r2 = await waitMarks(page, { rf: '1' }, 3000);
  check(r2.ok, 'G2: Enter on "Use the flow solve" returns the ring to the solve (pictogram 1)', JSON.stringify(r2.got));
  console.log('  focus after solve:', await focusInfo(), '| row text:', JSON.stringify(await page.getByText(/From the flow solve|Set by hand|None yet/).allInnerTexts()));
  await sh('G2-solved');
  // Esc in the picker: does anything happen
  await page.keyboard.press('Escape');
  await idle(300);
  console.log('  after Escape, selected still:', JSON.stringify(await page.locator('.mep-dock-tab.on').allInnerTexts()));
});

// ---------------------------------------------------------------- G3
await goal('G3', async () => {
  await switchTo(t, 'l0.pdf');
  await rightClickRing('R1');
  await pickMenu('Goes up'); // level 0 above = up
  await switchTo(t, 'l1.pdf');
  await rightClickRing('R1');
  await pickMenu('Goes down'); // level 1 below = down: disagrees with level 0
  const t0 = Date.now();
  const tx = await toasts();
  console.log('  toasts right after the second choice:', JSON.stringify(tx));
  check(tx.some((x) => /disagree/.test(x)), 'G3: a text says that the arrows disagree', JSON.stringify(tx));
  await sh('G3-toast');
  const toastEl = page.locator('.mep-toast').first();
  if (await toastEl.count()) {
    const cut = await toastEl.evaluate((e) => ({ sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, w: e.getBoundingClientRect().width }));
    console.log('  toast size', JSON.stringify(cut));
    while (Date.now() - t0 < 20000 && (await toastEl.count()) > 0) await page.waitForTimeout(250);
    console.log(`  the toast stayed ${Date.now() - t0} ms`);
  }
  // look for the warning without the toast: Manage Buildings, Risers
  const dlg = page.locator('.mep-modal');
  S('open the menu: Manage Buildings');
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
  S('click the Risers tab');
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  await sh('G3-risers-tab');
  const wtxt = (await dlg.innerText()).replace(/\s+/g, ' ');
  check(/disagree/.test(wtxt), 'G3: the Risers tab says that the arrows disagree');
  console.log('  Risers tab text:', wtxt.slice(0, 600));
  S('close the dialog with Escape');
  await page.keyboard.press('Escape');
  await idle(500);
  // fix: level 1 goes up (comes up) instead
  await rightClickRing('R1');
  await pickMenu('Comes up');
  console.log('  toasts after the fix:', JSON.stringify(await toasts()));
  S('open Manage Buildings again to see if the warning is gone');
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(600);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  steps++;
  await idle(900);
  const w2 = (await dlg.innerText()).replace(/\s+/g, ' ');
  console.log('  Risers tab after fix, warnings word present:', /Warnings/.test(w2), '| disagree present:', /disagree/.test(w2));
  await sh('G3-after-fix');
  check(!/Arrows of .* disagree/.test(w2.replace(/R2[^.]*disagree[^.]*\./g, '')) || state === 'full', 'G3: after the fix the R1 warning is gone');
  await page.keyboard.press('Escape');
  await idle(500);
});

// ---------------------------------------------------------------- G4
await goal('G4', async () => {
  await page.evaluate(async (j) => { await window.__mepBuilding.load(j); }, JSON.stringify(makeFile()));
  await idle(1000);
  await switchTo(t, 'l0.pdf');
  const r0 = await waitMarks(page, { rf2: 'none' }, 2000);
  console.log('  R2 level 0 before:', JSON.stringify(r0.got));
  await sh('G4-start');
  await rightClickRing('R2');
  await pickMenu('Goes up');
  await switchTo(t, 'l1.pdf');
  await rightClickRing('R2');
  await pickMenu('Comes up');
  const r = await waitMarks(page, { rf2: '3' }, 3000);
  check(r.ok, 'G4: level 1 ring of R2 shows "comes up"', JSON.stringify(r.got));
  console.log('  toasts after G4 pair:', JSON.stringify(await toasts()));
  await sh('G4-level1');
  await switchTo(t, 'l0.pdf');
  const r2 = await waitMarks(page, { rf2: '2' }, 3000);
  check(r2.ok, 'G4: level 0 ring of R2 shows "goes up"', JSON.stringify(r2.got));
  await sh('G4-level0');
  // the pairs stay: page changes and a reload of the building file
  const json = JSON.stringify(await readFile());
  await switchTo(t, 'l2.pdf');
  await switchTo(t, 'l1.pdf');
  await page.evaluate(async (j) => { await window.__mepBuilding.load(j); }, json);
  await idle(1200);
  const r3 = await waitMarks(page, { rf2: '3' }, 3000);
  check(r3.ok, 'G4: the pair on level 1 stays after page changes and a reload', JSON.stringify(r3.got));
  // a source arrives later on level 0 for R2: pairs stay
  await switchTo(t, 'l0.pdf');
  const cfg2 = { withReturn: true, sources1: [0], sources2: [0], extra: [] };
  const { buildLevelProject } = await import('/root/MepApp/.claude/worktrees/buildings-b8/.claude/roadmap/work/b8-t05-lib.mjs');
  const p = await buildLevelProject(page, 0, cfg2);
  await page.evaluate((p) => window.__mepSketchScene.loadProjectFromJson(p), p);
  await idle(1500);
  await focusRings(page);
  const r4 = await waitMarks(page, { rf2: '2' }, 3000);
  check(r4.ok, 'G4: after a source is added later, level 0 keeps the hand-set pair', JSON.stringify(r4.got));
  console.log('  stored R2 l0, l1:', JSON.stringify(await storedPair('r2', 'l0')), JSON.stringify(await storedPair('r2', 'l1')));
  await sh('G4-source-added');
});

// ---------------------------------------------------------------- G5
await goal('G5', async () => {
  const dlg = page.locator('.mep-modal');
  S('click Menu, then "Manage Buildings…"');
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
  console.log('  dialog tabs:', JSON.stringify(await dlg.getByRole('tab').allInnerTexts()));
  await sh('G5-dialog-open');
  S('click the Risers tab');
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  await sh('G5-risers');
  const txt = (await dlg.innerText());
  console.log('  Risers tab text:', txt.replace(/\s+/g, ' ').slice(0, 900));
  const tags = await dlg.getByText('Arrows set by hand').count();
  console.log('  tags "Arrows set by hand":', tags);
  const shown = await dlg.getByText('Arrows set by hand').evaluateAll((els) => els.map((e) => {
    const row = e.closest('[class*=rp-level], [class*=row], li, tr') ?? e.parentElement;
    return (row?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 120);
  }));
  console.log('  rows with a tag:', JSON.stringify(shown));
  // is the riser named in the row, to tell R1 from R2?
  const rowsAll = await dlg.locator('[data-testid="riser-row"]').count();
  console.log('  riser rows in the tab:', rowsAll);
  {
    const r1name = makeFile().risers[0].name;
    const labelBtn = dlg.getByText(r1name, { exact: true }).first();
    console.log('  R1 name label count in the dialog:', await dlg.getByText(r1name, { exact: true }).count());
    S('click R1 in the diagram to see its rows');
    await dlg.locator('svg').getByText(state === 'full' ? r1name.slice(0, 6) : 'R1').first().click({ timeout: 4000 }).catch(async () => { await labelBtn.click({ timeout: 4000 }).catch(() => console.log('  could not click R1 label')); });
    await idle(700);
    await sh('G5-risers-R1');
    const txt2 = (await dlg.innerText());
    console.log('  after R1 click, tags:', await dlg.getByText('Arrows set by hand').count(), '| text:', txt2.replace(/\s+/g, ' ').slice(txt2.indexOf('Capacity') > 0 ? 0 : 0, 1100).slice(300, 1100));
  }
  await page.keyboard.press('Escape');
  await idle(400);
});

// ---------------------------------------------------------------- G6
await goal('G6', async () => {
  await page.evaluate(async (j) => { await window.__mepBuilding.load(j); }, JSON.stringify(makeFile({ dashedL2: true })));
  await idle(1200);
  await switchTo(t, 'l2.pdf');
  await sh('G6-start');
  await rightClickRing('R1');
  console.log('  dashed ring menu:', JSON.stringify(await menuLoc.allInnerTexts()));
  await sh('G6-menu');
  const items = await menuLoc.locator('button').allInnerTexts();
  check(items.length >= 1, 'G6: the menu offers something on a dashed ring', JSON.stringify(items));
  await page.keyboard.press('Escape');
  await idle(300);
  await leftClickRing('R1');
  console.log('  after a click on a dashed ring: tab', JSON.stringify(await page.locator('.mep-dock-tab.on').allInnerTexts()), 'props text:', JSON.stringify((await page.locator('.mep-dock').innerText()).replace(/\s+/g, ' ').slice(0, 200)));
  await sh('G6-clicked');
  // a pure dashed ring: no fitting of the drawing under it
  {
    S('press Delete with the fitting selected');
    await page.keyboard.press('Delete');
    await idle(800);
    console.log('  after Delete, fittings in scene:', await page.evaluate(() => window.__mepSketchScene.exportProject().fittings.length));
    await sh('G6b-start');
    await rightClickRing('R1');
    console.log('  pure dashed ring menu:', JSON.stringify(await menuLoc.allInnerTexts()));
    await sh('G6b-menu');
    await page.keyboard.press('Escape');
    await idle(300);
    await leftClickRing('R1');
    console.log('  click on a pure dashed ring: dock tab', JSON.stringify(await page.locator('.mep-dock-tab.on').allInnerTexts()));
    await sh('G6b-clicked');
  }
});

// ---------------------------------------------------------------- edge test: menu near the right and bottom edge (any width, key at 760)
await goal('EDGE', async () => {
  await page.evaluate(async (j) => { await window.__mepBuilding.load(j); }, JSON.stringify(makeFile()));
  await idle(1200);
  await switchTo(t, 'l1.pdf');
  const spots = [['right-bottom', 8, 8], ['right', 8, 300], ['bottom', 150, 8], ['mid-right', 60, 150]];
  for (const [name, fr, fb] of spots) {
    await pinRing('R1', fr, fb);
    const at = await screenOf(page, await ringPt('R1'));
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await idle(400);
    console.log(`  ${name}: ring at ${Math.round(at.x)},${Math.round(at.y)} menu box ${JSON.stringify(await menuLoc.boundingBox())}`);
    await menuWhole(`EDGE ${name}`);
    await sh(`EDGE-${name}`);
    // click the last pictogram in the menu to prove it can be reached
    const before = JSON.stringify(await readFile());
    await radioIn(menuLoc, 'Comes up, comes down').click();
    await idle(600);
    const after = await storedPair('r1', 'l1');
    check(pictOf(after) === '8', `EDGE ${name}: the last cell can be clicked`, JSON.stringify(after));
    // return to the solve for the next spot
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await idle(400);
    await menuLoc.getByText('Use the flow solve').click({ force: true });
    await idle(500);
  }
});

console.log('\nSTEP COUNTS', JSON.stringify(result));
await t.finish();
