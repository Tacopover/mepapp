// B7-T09c-3: the Risers tab, the takeoff and the summary link for a group with no source level (Example 5 of the open-ends plan).
// 3 levels from real PDFs, one riser, terminals 100 / 300+200 / 150, one open end on each level, NO equipment.
// Setup (documents, scale, project JSON, building file, summaries, the equipment of step 4) uses the scene API and the dev hook only.
// The task is read from the real DOM (Properties, Risers tab) after real clicks (canvas, document switcher, Capacity input, link "Read summaries now").
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';
import { exportScope, recordSuggestedNames } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b2-lib.mjs';
import { layoutChecks } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c3-layout.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c3/';
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
const { uuids, summaries, building } = await setup(t);

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const textOf = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);
const allTexts = (id) => page.locator(`[data-testid="${id}"]`).evaluateAll((els) => els.map((e) => e.textContent.trim()));
const rowsText = () => page.locator('[data-testid="riser-capacity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const solved = () =>
  page.evaluate(() => {
    const row = [...document.querySelectorAll('.mep-field-row')].find((r) => /^solved capacity/i.test(r.querySelector('label')?.textContent?.trim() ?? ''));
    return row?.querySelector('input')?.value ?? null;
  });
const docOf = () => page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.id === window.__mepSketchScene.getActiveDocumentId())?.fileName);
const pageH = () => page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);

async function activate(name) {
  if ((await docOf()) === name) return;
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(100);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
  await idle(900);
}
async function selectTool() {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
}
async function clickPoint(p) {
  const at = await screenOf(page, p);
  await page.mouse.click(at.x, at.y);
  await idle(450);
}
/** Click until the Solved capacity field reads `want` (the live data can take a moment after a switch); returns the last value. */
async function solvedAfter(p, want, tries = 8) {
  let value = null;
  for (let i = 0; i < tries; i += 1) {
    await selectTool();
    await clickPoint(p);
    value = await solved();
    if (value === want) return value;
    await idle(400);
  }
  return value;
}
const RF = (H) => ({ x: 300, y: H - 300 });
const OPEN_SEG = (H) => ({ x: 450, y: H - 375 });
const MAIN_SEG = (H) => ({ x: 375, y: H - 300 });
async function clickStamp(id) {
  const p = await page.evaluate((id) => window.__mepSketchScene.exportProject().stamps.find((s) => s.id === id).transform.position, id);
  await selectTool();
  await clickPoint(p);
}
async function setCapacityTo(from, to) {
  const index = await page.evaluate((from) => [...document.querySelectorAll('.mep-field-row input[type="number"]')].findIndex((i) => i.value === String(from)), from);
  if (index < 0) return false;
  const input = page.locator('.mep-field-row input[type="number"]').nth(index);
  await input.fill(String(to));
  await input.press('Tab');
  await idle(400);
  return true;
}
async function typeCapacity(value) {
  const input = page.locator('.mep-field-row', { has: page.locator('label', { hasText: /^Capacity/ }) }).locator('input[type="number"]').first();
  await input.fill(String(value));
  await input.press('Enter');
  await idle(500);
  return true;
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
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const AT_MOST_ROWS = (a, b) => [`Level 0 to Level 1: at most ${a} m³/h`, `Level 1 to Level 2: at most ${b} m³/h`];
const WARNING_R1 = 'Riser R1 has no source level yet. Each capacity shows the largest flow for any source position.';
const NOTE_L2 = 'The summary of Level 2 has no open-end data. Read the summaries.';
const NOTE_L1 = 'The summary of Level 1 has no open-end data. Read the summaries.';

let H = 0;

// --- 1. the Risers tab (Example 5, no equipment) ---
await activate('l1.pdf');
H = await pageH();
await idle(800);
await showRisers();
{
  check(sameJson(await rowsText(), AT_MOST_ROWS(650, 600)), 'step 1: rows read at most 650 and at most 600', JSON.stringify(await rowsText()));
  check((await textOf('riser-capacity-main')) === 'Main level: not known yet (no source level)', 'step 1: main line', String(await textOf('riser-capacity-main')));
  check((await textOf('riser-capacity-total')) === 'Connected total: 750 m³/h (no concurrency factor)', 'step 1: connected total 750', String(await textOf('riser-capacity-total')));
  const hints = await allTexts('riser-capacity-hint');
  check(hints.length === 3 && hints[0].startsWith('No source level yet.') && /Place source equipment on a level/.test(hints[2]), 'step 1: the three hints of section 7', JSON.stringify(hints));
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'step 1: no link "Read summaries now" (all summaries have open-end data)');
  check((await page.locator('[data-testid="riser-not-design-flow"]').count()) === 0, 'step 1: no design-flow tag for an air riser');
  await snap('b7-t09c3-risers-atmost');
  await layoutChecks({ page, check, idle, snap, rowsText, atMostRows: AT_MOST_ROWS });
}
await closeDialog();

// --- 2. Level 1: the numbers of Properties ---
await snap('b7-t09c3-step2-start');
await selectTool();
check((await solvedAfter(OPEN_SEG(H), 'at most 750')) === 'at most 750', 'step 2: the open segment of Level 1 reads at most 750', String(await solved()));
check((await solvedAfter(RF(H), 'at most 650')) === 'at most 650', 'step 2: the riser fitting of Level 1 reads at most 650', String(await solved()));
check((await solvedAfter(MAIN_SEG(H), 'at most 500')) === 'at most 500', 'step 2: the segment from the riser fitting to the tee reads at most 500', String(await solved()));

// --- 6a. takeoff, scope Building, no source ---
await recordSuggestedNames(t);
{
  const all = await exportScope(t, 'building');
  const table = all.xlsx.sheets.Risers ?? [];
  const head = table[0] ?? [];
  const col = (name) => head.indexOf(name);
  const cells = table.slice(1).map((r) => [r[col('Capacity')], r[col('Capacity unit')], r[col('Capacity complete')]]);
  check(sameJson(head.slice(-3), ['Capacity', 'Capacity unit', 'Capacity complete']), 'step 6: the headers are unchanged', JSON.stringify(head));
  check(sameJson(cells, [['650', 'm³/h', 'At most'], ['600', 'm³/h', 'At most']]), 'step 6: the column "Capacity complete" reads At most for both rows', JSON.stringify(cells));
  const warn = (all.xlsx.sheets.Warnings ?? []).map((r) => r[0]);
  check(warn.filter((w) => w === WARNING_R1).length === 1, 'step 6: the takeoff warning line of riser R1 shows once', JSON.stringify(warn));
  check(warn.some((w) => /plain sum of connected capacities/.test(w)), 'step 6: the old capacity warning stays', JSON.stringify(warn));
  // A page that shows the exported cells and warnings, for the screenshot (the data comes from the real export above).
  const view = await page.context().newPage();
  await view.setContent(
    `<body style="font:14px sans-serif;padding:16px"><h3>Takeoff, scope Building, sheet Risers (columns of the capacity)</h3><table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Riser</th><th>From level</th><th>To level</th><th>Capacity</th><th>Capacity unit</th><th>Capacity complete</th></tr>${table
      .slice(1)
      .map((r) => `<tr><td>${r[col('Riser')]}</td><td>${r[col('From level')]}</td><td>${r[col('To level')]}</td><td>${r[col('Capacity')]}</td><td>${r[col('Capacity unit')]}</td><td>${r[col('Capacity complete')]}</td></tr>`)
      .join('')}</table><h3>Sheet Warnings</h3><ul>${warn.map((w) => `<li>${w}</li>`).join('')}</ul></body>`,
  );
  await view.setViewportSize({ width: 1000, height: 520 });
  await view.screenshot({ path: `${SHOTS}b7-t09c3-takeoff-warning.png` });
  console.log(`SHOT ${SHOTS}b7-t09c3-takeoff-warning.png`);
  await view.close();
}

// --- 3. a live edit on Level 0 with no save ---
await activate('l0.pdf');
await idle(800);
await clickStamp('t0');
await snap('b7-t09c3-step3-stamp-selected');
check(await typeCapacity(250), 'step 3: typed 250 into the Capacity input of Tm0 (real input)');
await activate('l1.pdf');
await idle(600);
check((await solvedAfter(OPEN_SEG(H), 'at most 900')) === 'at most 900', 'step 3: after the switch (no save) the open segment reads at most 900', String(await solved()));
check((await solvedAfter(RF(H), 'at most 750')) === 'at most 750', 'step 3: the riser fitting reads at most 750', String(await solved()));
await showRisers();
{
  check(sameJson(await rowsText(), AT_MOST_ROWS(650, 750)), 'step 3: Risers tab rows read at most 650 and at most 750', JSON.stringify(await rowsText()));
  check((await textOf('riser-capacity-total')) === 'Connected total: 900 m³/h (no concurrency factor)', 'step 3: connected total 900', String(await textOf('riser-capacity-total')));
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'step 3: no link "Read summaries now" (the live data covers the open levels)');
}
await closeDialog();

// --- 5. an old summary (no openEnds) of a level that is not open ---
{
  await page.locator('.mep-doc-switcher-btn').click();
  await idle(200);
  page.once('dialog', (d) => d.accept());
  await page.locator('.mep-doc-switcher-dropdown .mep-doc-close[title="Close l2.pdf"]').click();
  await idle(900);
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) > 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(300);
  const old = JSON.parse(summaries[2]);
  for (const entry of old.riserNetworks) delete entry.openEnds;
  await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [uuids[0]]: summaries[0], [uuids[1]]: summaries[1], [uuids[2]]: JSON.stringify(old) }]);
  await idle(700);
  await showRisers();
  const text = await dlg.evaluate((el) => el.textContent ?? '');
  check(text.includes(NOTE_L2), 'step 5: the note for Level 2 shows', NOTE_L2);
  check(!text.includes(NOTE_L1), 'step 5: no note for Level 1 (its summary is live)');
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 1, 'step 5: the link "Read summaries now" shows');
  {
    await page.setViewportSize({ width: 760, height: 900 });
    await closeDialog();
    await showRisers();
    await idle(500);
    const v = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="riser-read-summaries"]');
      const box = el.getBoundingClientRect();
      let clipBottom = window.innerHeight;
      for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
        if (/(auto|scroll|hidden)/.test(getComputedStyle(node).overflowY)) clipBottom = Math.min(clipBottom, node.getBoundingClientRect().bottom);
      }
      return { top: box.top, bottom: box.bottom, clipBottom, ok: box.bottom <= clipBottom + 1 };
    });
    check(v.ok, 'step 5 at 760 px: the link Read summaries now is fully inside the visible part (journey finding)', JSON.stringify(v));
    await snap('b7-t09c3-old-summary-760');
    await page.setViewportSize({ width: 1600, height: 1000 });
    await idle(500);
    await closeDialog();
    await showRisers();
  }
  check(sameJson(await rowsText(), ['Level 0 to Level 1: not known yet (no source level)', 'Level 1 to Level 2: not known yet (no source level)']), 'step 5: the rows read not known yet', JSON.stringify(await rowsText()));
  await snap('b7-t09c3-old-summary-link');
  await page.locator('[data-testid="riser-read-summaries"]').click();
  await until(async () => (await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'link run ends', 30000);
  await idle(900);
  const after = await dlg.evaluate((el) => el.textContent ?? '');
  check(!after.includes(NOTE_L2), 'step 5: after the link the note is gone');
  check(sameJson(await rowsText(), AT_MOST_ROWS(650, 750)), 'step 5: after the link the rows read at most again', JSON.stringify(await rowsText()));
  await closeDialog();
}

// --- 4. an equipment at the open end of Level 0 (setup call) ---
await activate('l0.pdf');
await idle(800);
await page.evaluate(() => {
  const scene = window.__mepSketchScene;
  const p = scene.exportProject();
  const o = p.fittings.find((f) => f.id === 'o');
  const src = JSON.parse(JSON.stringify(p.stamps[0]));
  const sx = src.transform.scale?.x ?? 1;
  src.id = 'src';
  src.category = 'equipment';
  src.ports = [{ id: 'out', name: 'Out', fractionX: 1, fractionY: 0.5 }];
  src.transform = { ...src.transform, position: { x: o.position.x - 0.5 * src.nativeWidth * sx, y: o.position.y } };
  p.stamps.push(src);
  p.fittings = p.fittings.filter((f) => f.id !== 'o');
  p.segments.find((s) => s.id === 's9').endpointB = { kind: 'port', elementId: 'src', portId: 'out' };
  scene.loadProjectFromJson(p);
});
await idle(1200);
await showRisers();
{
  check(sameJson(await rowsText(), ['Level 0 to Level 1: 650 m³/h', 'Level 1 to Level 2: 150 m³/h']), 'step 4: rows read 650 and 150 with no at most', JSON.stringify(await rowsText()));
  check((await textOf('riser-capacity-main')) === 'Main level: Level 0', 'step 4: main level is Level 0', String(await textOf('riser-capacity-main')));
  check((await textOf('riser-capacity-total')) === 'Connected total: 900 m³/h (no concurrency factor)', 'step 4: connected total 900', String(await textOf('riser-capacity-total')));
  check((await allTexts('riser-capacity-hint')).length === 0, 'step 4: no hint', JSON.stringify(await allTexts('riser-capacity-hint')));
  await snap('b7-t09c3-risers-settled');
}
await closeDialog();
await activate('l1.pdf');
await idle(600);
check((await solvedAfter(OPEN_SEG(H), '0')) === '0', 'step 4: on Level 1 the open segment reads plain 0', String(await solved()));
check((await solvedAfter(RF(H), '650')) === '650', 'step 4: on Level 1 the riser fitting reads plain 650', String(await solved()));
await activate('l0.pdf');
await idle(800);
{
  const all = await exportScope(t, 'building');
  const table = all.xlsx.sheets.Risers ?? [];
  const head = table[0] ?? [];
  const col = (name) => head.indexOf(name);
  const cells = table.slice(1).map((r) => [r[col('Capacity')], r[col('Capacity unit')], r[col('Capacity complete')]]);
  check(sameJson(cells, [['650', 'm³/h', 'Yes'], ['150', 'm³/h', 'Yes']]), 'step 4: the takeoff reads Yes again', JSON.stringify(cells));
  const warn = (all.xlsx.sheets.Warnings ?? []).map((r) => r[0]);
  check(!warn.some((w) => /has no source level yet/.test(w)), 'step 4: the takeoff has no no-source line', JSON.stringify(warn));
}

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
