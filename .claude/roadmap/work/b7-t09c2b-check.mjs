// B7-T09c-2b: the Risers tab and the riser block of Properties for a group with no source level (Example 5 of the open-ends plan).
// 3 levels from real PDFs, one riser, terminals 100 / 300+200 / 150, one open end on each level, NO equipment.
// Setup (documents, scale, project JSON, building file, summaries) uses the scene API and the dev hook only.
// Everything the task changes is read from the real DOM (Risers tab, Properties) after real clicks (document switcher, canvas, Set by hand, the Source level select).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { screenOfCentered as screenOf } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t04b-lib.mjs';
import { setup } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/b7-t09c2b-setup.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t09c2b/';
const t = await open();
const { page, check, idle, menu, until } = t;
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await t.start();
await setup(t);

const snap = async (name) => {
  const path = `${SHOTS}${name}.png`;
  await page.screenshot({ path });
  console.log(`SHOT ${path}`);
};
const textOf = async (id) => ((await page.locator(`[data-testid="${id}"]`).count()) > 0 ? (await page.locator(`[data-testid="${id}"]`).first().innerText()).trim() : null);
const allTexts = (id) => page.locator(`[data-testid="${id}"]`).evaluateAll((els) => els.map((e) => e.textContent.trim()));
const rowsText = () => page.locator('[data-testid="riser-capacity-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
const docOf = () => page.evaluate(() => window.__mepSketchScene.getDocuments().find((d) => d.id === window.__mepSketchScene.getActiveDocumentId())?.fileName);

async function activate(name) {
  if ((await docOf()) === name) return;
  if ((await page.locator('.mep-doc-switcher-dropdown').count()) === 0) await page.locator('.mep-doc-switcher-btn').click();
  await idle(100);
  await page.locator('.mep-doc-switcher-dropdown .mep-elem-row', { hasText: name }).first().click();
}
async function selectTool() {
  await page.locator('button.mep-rail-btn[title="Select"]').click();
  await idle(100);
}
async function clickFitting() {
  const H = await page.evaluate(() => window.__mepSketchScene.getDisplayedPageSize().heightPt);
  const at = await screenOf(page, { x: 300, y: H - 300 });
  await page.mouse.click(at.x, at.y);
  await idle(500);
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

const HINT1 = 'No source level yet. Each span shows the largest flow for any source position.';
const HINT2 = 'Numbers show different source positions. They do not add up at a fitting. An empty capacity counts as 0.';
const HINT3 = 'Place source equipment on a level, or click Set by hand and choose a main level.';
const HINT3_SELECT = 'Place source equipment on a level, or choose a main level in the list "Source level".';
const RISER_HINT = 'No source level yet. Solved capacity shows the largest flow for any source position. Open Manage Buildings, tab Risers, to set the main level.';

// --- 1. the riser block of Properties, level 1 ---
await activate('l1.pdf');
await idle(1500);
await selectTool();
await clickFitting();
await until(async () => (await textOf('props-riser-main')) !== null, 'riser block shown', 6000);
await until(async () => (await textOf('props-riser-main')) === 'not known yet (no source level)', 'riser block has the at-most main line', 6000).catch(() => {});
check((await textOf('props-riser-main')) === 'not known yet (no source level)', 'level 1 riser block: Main level reads "not known yet (no source level)"', String(await textOf('props-riser-main')));
check((await textOf('props-riser-total')) === '750 m³/h (no concurrency factor)', 'level 1 riser block: connected total 750', String(await textOf('props-riser-total')));
{
  const hints = await allTexts('props-riser-hint');
  check(hints.includes(RISER_HINT), 'level 1 riser block: the riser-fitting hint of section 7 shows', JSON.stringify(hints));
  check(!hints.some((h) => /counts this level only/.test(h)), 'level 1 riser block: the old "counts this level only" hint is gone', JSON.stringify(hints));
}
await snap('b7-t09c2b-1-properties-riser-block');

// --- 2. the Risers tab ---
await showRisers();
{
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: at most 650 m³/h', 'Level 1 to Level 2: at most 600 m³/h']), 'Risers tab: rows read "at most 650 m³/h" and "at most 600 m³/h"', JSON.stringify(rows));
  check((await textOf('riser-capacity-main')) === 'Main level: not known yet (no source level)', 'Risers tab: main line', String(await textOf('riser-capacity-main')));
  check((await textOf('riser-capacity-total')) === 'Connected total: 750 m³/h (no concurrency factor)', 'Risers tab: connected total 750', String(await textOf('riser-capacity-total')));
  const hints = await allTexts('riser-capacity-hint');
  check(JSON.stringify(hints) === JSON.stringify([HINT1, HINT2, HINT3]), 'Risers tab: the three hint paragraphs of section 7 with the one source word', JSON.stringify(hints));
  check(!hints.some((h) => /Click Set by hand and choose a source level/.test(h)), 'Risers tab: the old "Click Set by hand and choose a source level." is gone');
  check((await page.locator('[data-testid="riser-read-summaries"]').count()) === 0, 'Risers tab: no link "Read summaries now" (all summaries have the open-end data)');
  await snap('b7-t09c2b-2-risers-at-most');
}

// --- 3. Set by hand: the "Set by hand" button is replaced by the list, and the text follows ---
await page.locator('[data-testid="riser-set-by-hand"]').click();
await idle(600);
{
  const hints = await allTexts('riser-capacity-hint');
  check(hints.includes(HINT3_SELECT), 'after Set by hand: hint 3 points to the list "Source level"', JSON.stringify(hints));
  check(!hints.some((h) => /click Set by hand/i.test(h)), 'after Set by hand: no hint names a button that is not there', JSON.stringify(hints));
  await snap('b7-t09c2b-3-risers-selects-shown');
}
// choose the main level by hand in the real select
await page.locator('[data-testid="riser-source-select"]').selectOption({ label: 'Level 0' });
await idle(1200);
{
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: 650 m³/h', 'Level 1 to Level 2: 150 m³/h']), 'main level Level 0 by hand: plain rows 650 and 150, no "at most"', JSON.stringify(rows));
  check((await textOf('riser-capacity-main')) === 'Main level: Level 0', 'main level Level 0 by hand: main line', String(await textOf('riser-capacity-main')));
  const hints = await allTexts('riser-capacity-hint');
  check(!hints.some((h) => /No source level yet/.test(h)), 'main level Level 0 by hand: no source-less hint', JSON.stringify(hints));
  await snap('b7-t09c2b-4-risers-hand-set');
}
// back to the flow solve
await page.locator('[data-testid="riser-use-solve"]').click();
await idle(1200);
{
  const rows = await rowsText();
  check(JSON.stringify(rows) === JSON.stringify(['Level 0 to Level 1: at most 650 m³/h', 'Level 1 to Level 2: at most 600 m³/h']), 'Use the flow solve: the "at most" rows are back', JSON.stringify(rows));
  check((await textOf('riser-capacity-main')) === 'Main level: not known yet (no source level)', 'Use the flow solve: main line is back', String(await textOf('riser-capacity-main')));
}
await closeDialog();

check(errors.length === 0, 'no page errors', errors.join(' | '));
await t.finish();
