// B7-T07: the live numbers of every OPEN level count, saved or not. 3 levels from real PDFs, one riser, terminals 100 / 300+200 / 150, source on level 0.
// Setup (documents, scale, project JSON, building file, summaries) uses the scene API and the dev hook only (b7-t05-journey-setup.mjs).
// Everything the task changes is driven by real clicks (canvas, document switcher, capacity input, Building dialog, close button) and read from the real DOM.
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t05-journey-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t07/';
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids } = await setup(t);

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
const calls = () => page.evaluate(() => window.__calls);
const lastCall = async () => {
  const all = await calls();
  return all.length === 0 ? null : all[all.length - 1];
};
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const storedTerminal = (uuid) =>
  page.evaluate(async (u) => JSON.parse((await window.__mepBuilding.store.readSummary(u)) ?? 'null')?.riserNetworks?.[0]?.terminalCapacity ?? null, uuid);
const docIdOf = (name) => page.evaluate((name) => window.__mepSketchScene.getDocuments().find((d) => d.fileName === name)?.id ?? null, name);

async function activate(name) {
  if ((await page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.id === window.__mepSketchScene.getActiveDocumentId())?.fileName)) === name) return;
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(100);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
}
async function selectTool() {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
}
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
async function clickPoint(p) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(400);
}
async function clickFitting() {
  const H = await pageH();
  await clickPoint({ x: 300, y: H - 300 });
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
/** Poll until the last call of setRiserFlowInputs equals `want`; returns the milliseconds that it took, or -1. */
async function waitCall(want, ms = 2500) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (sameJson(await lastCall(), want)) return Date.now() - start;
    await new Promise((r) => setTimeout(r, 40));
  }
  return -1;
}
const dlg = page.locator('.mep-modal');
async function showRisers() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
  await dlg.getByRole('tab', { name: /^Risers/ }).click();
  await idle(900);
  await page.locator('[data-testid="riser-capacity"]').waitFor({ state: 'visible', timeout: 8000 });
  await until(async () => (await page.locator('[data-testid="riser-capacity"]').innerText()).indexOf('Reading the saved summaries') < 0, 'summaries read', 8000);
}
async function closeDialog() {
  await page.keyboard.press('Escape');
  await idle(500);
}
const rowsText = () => page.locator('[data-testid="riser-capacity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const textOf = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);

// spy on the call that the building solve makes to the scene
await page.evaluate(() => {
  const s = window.__mepSketchScene;
  window.__calls = [];
  window.__times = { activated: [], calls: [], activate: [], exportOf: [] };
  const activateOriginal = s.activateDocument.bind(s);
  s.activateDocument = (id) => {
    const at = performance.now();
    activateOriginal(id);
    window.__times.activate.push(Math.round(performance.now() - at));
  };
  const exportOriginal = s.exportProjectOf.bind(s);
  s.exportProjectOf = (id) => {
    const at = performance.now();
    const out = exportOriginal(id);
    window.__times.exportOf.push(Math.round(performance.now() - at));
    return out;
  };
  s.on('documentActivated', () => window.__times.activated.push(performance.now()));
  const original = s.setRiserFlowInputs.bind(s);
  s.setRiserFlowInputs = (inputs) => {
    window.__times.calls.push(performance.now());
    window.__calls.push(JSON.parse(JSON.stringify(inputs)));
    return original(inputs);
  };
});

// --- 0. the starting numbers (everything saved) ---
await activate('l1.pdf');
await idle(1200);
await selectTool();
check((await waitCall({ rf: { role: 'entry', demandBeyond: 150 } })) >= 0, 'start: level 1 gets { rf: entry, 150 }', JSON.stringify(await lastCall()));
check((await storedTerminal(uuids[0])) === 100 && (await storedTerminal(uuids[1])) === 500 && (await storedTerminal(uuids[2])) === 150, 'start: the stored summaries hold 100, 500, 150');

// --- 1. level 2: 150 -> 250, NOT saved; switch to level 1 ---
await activate('l2.pdf');
await idle(1000);
await selectTool();
await clickStamp('t0');
check(await setCapacityTo(150, 250), 'level 2: typed 250 into the capacity input (real input)');
await idle(300);
check((await storedTerminal(uuids[2])) === 150, 'level 2 is NOT saved: its stored summary still says 150');
await activate('l1.pdf');
{
  const ms = await waitCall({ rf: { role: 'entry', demandBeyond: 250 } });
  check(ms >= 0, 'step 1: after the switch level 1 gets { rf: entry, 250 } with no save', `ms=${ms} last=${JSON.stringify(await lastCall())}`);
  console.log('SWITCH TO RESULT ms', ms);
  await idle(300);
  await selectTool();
  await clickFitting();
  check((await solved()) === '750', 'step 1: the riser fitting of level 1 shows 750 (500 + 250)', String(await solved()));
  check((await byId('props-riser-total')) === '850 m³/h (no concurrency factor)', 'step 1: connected total 850', String(await byId('props-riser-total')));
  check((await storedTerminal(uuids[2])) === 150, 'step 1: level 2 is still not saved (stored summary 150)');
  await snap('b7-t07-1-level1-live');
}

// --- 2. level 1: 300 -> 400, NOT saved; switch to level 0 ---
await clickStamp('t0');
check(await setCapacityTo(300, 400), 'level 1: typed 400 into the capacity input (real input)');
await idle(300);
check((await storedTerminal(uuids[1])) === 500, 'level 1 is NOT saved: its stored summary still says 500');
await activate('l0.pdf');
{
  const ms = await waitCall({ rf: { role: 'exit', demandBeyond: 850 } });
  check(ms >= 0, 'step 2: after the switch level 0 gets { rf: exit, 850 } (600 + 250)', `ms=${ms} last=${JSON.stringify(await lastCall())}`);
  console.log('SWITCH TO RESULT ms', ms);
  {
    const tm = await page.evaluate(() => window.__times);
    const lastActivated = tm.activated[tm.activated.length - 1];
    const lastCallAt = tm.calls[tm.calls.length - 1];
    console.log('documentActivated to inputs call (ms)', Math.round(lastCallAt - lastActivated), 'activateDocument sync ms', JSON.stringify(tm.activate), 'exportProjectOf ms', JSON.stringify(tm.exportOf));
  }
  await idle(300);
  await selectTool();
  await clickFitting();
  check((await byId('props-riser-main')) === 'Level 0', 'step 2: Main level is Level 0', String(await byId('props-riser-main')));
  check((await solved()) === '850', 'step 2: the exit fitting of level 0 shows 850', String(await solved()));
  check((await byId('props-riser-total')) === '950 m³/h (no concurrency factor)', 'step 2: connected total 950', String(await byId('props-riser-total')));
  await snap('b7-t07-2-level0-live');
}

// --- 3. the Building dialog with level 1 open shows the live numbers of all open levels ---
await activate('l1.pdf');
await idle(1000);
await showRisers();
{
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: 850 m³/h', 'Level 1 to Level 2: 250 m³/h']), 'step 3: the rows count the live numbers of level 1 and level 2', JSON.stringify(rows));
  check((await textOf('riser-capacity-total')) === 'Connected total: 950 m³/h (no concurrency factor)', 'step 3: connected total 950', String(await textOf('riser-capacity-total')));
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'step 3: no link "Read summaries now"');
  await snap('b7-t07-3-dialog-live');
}
await closeDialog();

// --- 4. close level 2 without saving: its stored summary counts again (150) ---
if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
await idle(200);
page.once('dialog', (d) => d.accept());
await page.locator('.mep-doc-switcher-dropdown .mep-doc-close[title="Close l2.pdf"]').click();
await idle(800);
if ((await page.locator('.mep-doc-switcher-dropdown').count()) > 0) await page.locator('.mep-doc-switcher-btn').click();
await idle(300);
check((await docIdOf('l2.pdf')) === null, 'step 4: level 2 is closed');
await showRisers();
{
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: 750 m³/h', 'Level 1 to Level 2: 150 m³/h']), 'step 4: level 2 counts its stored summary (150), level 1 stays live (600)', JSON.stringify(rows));
  check((await textOf('riser-capacity-total')) === 'Connected total: 850 m³/h (no concurrency factor)', 'step 4: connected total 850', String(await textOf('riser-capacity-total')));
  await snap('b7-t07-4-closed-level2');
}
await closeDialog();

// --- 5. a switch right after an edit (the 200 ms delay did not run yet) keeps the edit ---
await activate('l1.pdf');
await idle(800);
await selectTool();
{
  // The edit and the switch happen in one tick, so the 200 ms edit delay of the hook cannot run before the switch. This is setup of a timing case, not a wiring proof (step 2 used the real input).
  const id0 = await docIdOf('l0.pdf');
  await page.evaluate((id) => {
    window.__mepSketchScene.setTerminalCapacity('t0', 450);
    window.__mepSketchScene.activateDocument(id);
  }, id0);
  const ms = await waitCall({ rf: { role: 'exit', demandBeyond: 800 } });
  check(ms >= 0, 'race: level 0 gets { rf: exit, 800 } (650 + 150 of the stored level 2), the last edit is not lost', `ms=${ms} last=${JSON.stringify(await lastCall())}`);
  await idle(300);
  await selectTool();
  await clickFitting();
  check((await solved()) === '800', 'race: the exit fitting of level 0 shows 800', String(await solved()));
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
