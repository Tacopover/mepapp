// B7-T04b part check: the open level counts the other levels. 3 levels from real PDFs, one riser, terminals 100 / 300+200 / 150, source on level 0.
// Setup (documents, scale, project JSON, building file, summaries) uses the scene API and the dev hook only (b7-t05-journey-setup.mjs).
// Everything the task changes is read from the real DOM (Properties panel) and driven by real clicks (canvas, document tab, capacity input, menu Save).
// The scene API is used to read state (calls of setRiserFlowInputs through a spy, count of flowSolved events).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup, TYPE } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t04b/';
const t = await open();
const { page, check, idle, menu, until, statusText } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const solved = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    return row?.querySelector('input')?.value ?? null;
  });
const byId = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);
const hints = () => page.locator('[data-testid="props-riser-hint"]').allInnerTexts();
const headerTotal = async () => {
  await page.locator('.mep-dock-tab-label', { hasText: /^Networks$/ }).click();
  await idle(300);
  const text = (await page.locator('.mep-flow-result').first().innerText()).trim();
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(200);
  return text;
};
const calls = () => page.evaluate(() => window.__calls);
const lastCall = async () => {
  const all = await calls();
  return all.length === 0 ? null : all[all.length - 1];
};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function activate(name) {
  await page.locator('.mep-doc-switcher-btn').click();
  await idle(200);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
  await idle(1000);
}
async function selectTool() {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(200);
}
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(500);
}
async function clickFitting() {
  const H = await pageH();
  await clickPoint({ x: 300, y: H - 300 });
}
async function clickDuct() {
  const H = await pageH();
  await clickPoint({ x: 375, y: H - 300 });
}
async function clickStamp(id) {
  const p = await page.evaluate((id) => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === id).transform.position, id);
  await clickPoint(p);
}
async function setCapacityTo(from, to) {
  const index = await page.evaluate((from) => [...document.querySelectorAll('.mep-field-row input[type="number"]')].findIndex((i) => i.value === String(from)), from);
  if (index < 0) return false;
  const input = page.locator('.mep-field-row input[type="number"]').nth(index);
  await input.fill(String(to));
  await input.press('Tab');
  return true;
}
async function loadBuilding(file, stored) {
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(file), stored]);
  await idle(1200);
}

// spy on the one call that the task adds, and count the flowSolved events
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  window.__calls = [];
  window.__solved = 0;
  const original = s.setRiserFlowInputs.bind(s);
  s.setRiserFlowInputs = (inputs) => {
    window.__calls.push(JSON.parse(JSON.stringify(inputs)));
    return original(inputs);
  };
  s.on('flowSolved', () => {
    window.__solved += 1;
  });
});

// --- 1. known: level 1 open, source on level 0 (worked example) ---
await activate('l1.pdf');
await selectTool();
await idle(500);
check(sameJson(await lastCall(), { rf: { role: 'entry', demandBeyond: 150 } }), 'level 1 open: the scene got { rf: entry, 150 }', JSON.stringify(await calls()));
await clickDuct();
console.log('DUCT', await page.locator('.mep-panel, .mep-dock').first().innerText().catch(() => ''));
check((await solved()) === '500', 'the duct that ends at the riser shows 500', String(await solved()));
check((await page.locator('[data-testid="props-riser-section"]').count()) === 0, 'no riser block for a duct');
check((await byId('props-segment-riser-hint')) === 'This segment is on the network of riser R1. Select the riser fitting to see the connected total.', 'the duct shows the hint that the rest of the building is at the riser fitting', String(await byId('props-segment-riser-hint')));
await snap('b7-t04b-1-duct-1600');
await page.setViewportSize({ width: 760, height: 900 });
await idle(500);
await snap('b7-t04b-1-duct-760');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
await clickFitting();
check((await solved()) === '650', 'the riser fitting shows 650 (500 + 150 of level 2)', String(await solved()));
check((await byId('props-riser-main')) === 'Level 0', 'Main level row: Level 0', String(await byId('props-riser-main')));
check((await byId('props-riser-total')) === '750 m³/h (no concurrency factor)', 'Connected total row: 750 m³/h (no concurrency factor)', String(await byId('props-riser-total')));
check((await page.locator('[data-testid="props-riser-section"] h4').innerText()).trim().toLowerCase() === 'riser r1', 'heading Riser R1');
check((await hints()).length === 0, 'no hint in the known state', JSON.stringify(await hints()));
check((await page.locator('[data-testid="props-riser-total"]').getAttribute('title')) === 'Connected total: 750 m³/h (no concurrency factor)', 'title of the total row');
check(!/Up|Down|flow direction/i.test(await page.locator('[data-testid="props-riser-section"]').innerText()), 'no direction word in the block');
check(/^500 total capacity across 1 network/.test(await headerTotal()), 'header total stays level-only (500)', await headerTotal());
await snap('b7-t04b-1-known-1600');
await page.setViewportSize({ width: 760, height: 900 });
await idle(500);
await snap('b7-t04b-1-known-760');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
// the terminals keep their own numbers
await clickStamp('t0');
check((await page.locator('.mep-field-row input[type="number"]').evaluateAll((els) => els.map((e) => e.value))).includes('300'), 'terminal t0 still has capacity 300');

// --- 2. a capacity edit on the open level changes the numbers by itself ---
{
  const before = await page.evaluate(() => window.__solved);
  check(await setCapacityTo(300, 400), 'typed 400 into the capacity input of terminal t0 (real input)');
  await idle(1500);
  const after = await page.evaluate(() => window.__solved);
  console.log('FLOWSOLVED events for one edit:', after - before);
  await idle(1500);
  const later = await page.evaluate(() => window.__solved);
  check(later === after, 'loop check: no flowSolved event in the 1.5 s after the numbers settled', `${after} -> ${later}`);
  check(after - before <= 8, 'loop check: at most 8 flowSolved events for one edit', String(after - before));
  check(sameJson(await lastCall(), { rf: { role: 'entry', demandBeyond: 150 } }), 'the inputs of level 1 are the same after the edit (150 beyond)', JSON.stringify(await lastCall()));
  await clickFitting();
  check((await solved()) === '750', 'after the edit the riser fitting shows 750 (600 + 150)', String(await solved()));
  check((await byId('props-riser-total')) === '850 m³/h (no concurrency factor)', 'Connected total after the edit: 850', String(await byId('props-riser-total')));
  check(/^600 total capacity/.test(await headerTotal()), 'header total after the edit is 600 (level only)', await headerTotal());
  await clickDuct();
  check((await solved()) === '600', 'the duct shows 600 after the edit', String(await solved()));
  await snap('b7-t04b-2-after-edit');
}

// --- 3. switch to another document and back ---
await activate('l0.pdf');
await selectTool();
{
  const c = await calls();
  console.log('CALLS after switch to level 0', JSON.stringify(c.slice(-2)));
  check(sameJson(await lastCall(), { rf: { role: 'exit', demandBeyond: 650 } }), 'level 0 open: the scene got { rf: exit, 650 } (level 1 is not saved: its stored summary counts)', JSON.stringify(await lastCall()));
  await clickFitting();
  check((await byId('props-riser-main')) === 'Level 0', 'level 0: Main level is Level 0', String(await byId('props-riser-main')));
  check((await solved()) === '650', 'level 0: the exit fitting carries what goes up: 650 (unsaved edit of level 1 not counted, D-B-75)', String(await solved()));
  check((await byId('props-riser-total')) === '750 m³/h (no concurrency factor)', 'level 0: total 750 (stored summary of level 1)', String(await byId('props-riser-total')));
}
await activate('l1.pdf');
await selectTool();
await clickFitting();
check((await solved()) === '750', 'back on level 1: the numbers are applied again (750)', String(await solved()));
check((await byId('props-riser-total')) === '850 m³/h (no concurrency factor)', 'back on level 1: total 850', String(await byId('props-riser-total')));

// --- 3b. a save of level 1 refreshes its stored summary: level 0 now counts 600 ---
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save l1');
await idle(1500);
await activate('l0.pdf');
await selectTool();
await clickFitting();
check((await solved()) === '750', 'after the save of level 1, the exit fitting of level 0 carries 750 (600 + 150)', String(await solved()));
check((await byId('props-riser-total')) === '850 m³/h (no concurrency factor)', 'level 0: total 850 after the save', String(await byId('props-riser-total')));
await activate('l1.pdf');
await selectTool();

// --- 4. a level with no summary: "at least" ---
await loadBuilding(building, { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1] });
await clickFitting();
console.log('AT LEAST', await byId('props-riser-main'), '|', await byId('props-riser-total'), '|', JSON.stringify(await hints()), '| solved', await solved());
check((await byId('props-riser-total')) === 'at least 700 m³/h (no concurrency factor)', 'level 2 has no summary: total reads "at least 700"', String(await byId('props-riser-total')));
check((await hints()).length === 1 && /so a number reads "at least"/.test((await hints())[0] ?? ''), 'one hint: some levels have no data', JSON.stringify(await hints()));
check((await hints()).every((h) => /Manage Buildings, tab Risers/.test(h)), 'the hint names the dialog and the tab');
await snap('b7-t04b-3-atleast-1600');
await page.setViewportSize({ width: 760, height: 900 });
await idle(500);
await snap('b7-t04b-3-atleast-760');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(300);

// --- 4b. the level with the source has no summary: the cause is missing data, not a missing source ---
await loadBuilding(building, { [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] });
await clickFitting();
console.log('NO DATA ON SOURCE LEVEL', await byId('props-riser-main'), '|', await byId('props-riser-total'), '|', JSON.stringify(await hints()));
check((await byId('props-riser-main')) === 'not known yet (a level has no data)', 'source level has no data: Main level names missing data', String(await byId('props-riser-main')));
check((await hints()).length === 1 && /so a number reads "at least"/.test((await hints())[0] ?? ''), 'source level has no data: only the hint about missing data', JSON.stringify(await hints()));
await snap('b7-t04b-3b-nodata-1600');

// --- 5. no source level: "not known yet" ---
{
  const noSource = JSON.parse(summaries[0]);
  noSource.riserNetworks[0].hasSource = false;
  noSource.savedAt = new Date(Date.now() + 5000).toISOString();
  await loadBuilding(building, { [uuids[0]]: JSON.stringify(noSource), [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] });
  await clickFitting();
  console.log('UNKNOWN', await byId('props-riser-main'), '|', await byId('props-riser-total'), '|', JSON.stringify(await hints()), '| solved', await solved(), '| last call', JSON.stringify(await lastCall()));
  check((await byId('props-riser-main')) === 'not known yet (no source level)', 'no source: Main level reads not known yet with the reason', String(await byId('props-riser-main')));
  check((await byId('props-riser-total')) === '850 m³/h (no concurrency factor)', 'no source: the total still shows', String(await byId('props-riser-total')));
  check((await solved()) === '600', 'no source: Solved capacity is level-only (600)', String(await solved()));
  check(sameJson(await lastCall(), {}), 'no source: the inputs were cleared with one {} call', JSON.stringify(await lastCall()));
  check((await hints()).some((h) => /counts this level only until the main level is known/.test(h)), 'hint for not known yet', JSON.stringify(await hints()));
  await snap('b7-t04b-4-unknown-1600');
  await page.setViewportSize({ width: 760, height: 900 });
  await idle(500);
  await snap('b7-t04b-4-unknown-760');
  await page.setViewportSize({ width: 1600, height: 1000 });
  await idle(300);
}

// --- 6. no unit and not a design flow ---
{
  const noUnit = JSON.parse(JSON.stringify(building));
  delete noUnit.risers[0].networkType.flowUnit;
  await loadBuilding(noUnit, { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] });
  await clickFitting();
  check((await byId('props-riser-total')) === '850 (no concurrency factor)', 'no unit: the total has no unit', String(await byId('props-riser-total')));
  check((await hints()).some((h) => /no flow unit/.test(h)), 'no unit: hint', JSON.stringify(await hints()));
  const fire = JSON.parse(JSON.stringify(building));
  fire.risers[0].networkType.discipline = 'fireProtection';
  await loadBuilding(fire, { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] });
  await clickFitting();
  check((await byId('props-riser-tag')) === 'Not a design flow', 'fire protection: tag Not a design flow', String(await byId('props-riser-tag')));
  check((await hints()).some((h) => /not a design flow for this network type/.test(h)), 'fire protection: hint', JSON.stringify(await hints()));
  await snap('b7-t04b-5-notdesign-1600');
}

// --- 7. back to the full building: numbers return ---
await loadBuilding(building, { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: summaries[2] });
await clickFitting();
check((await byId('props-riser-main')) === 'Level 0', 'full building again: Main level Level 0', String(await byId('props-riser-main')));

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
