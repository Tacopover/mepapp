// B3-T12c UI review: narrow window (800 px), keyboard only for the Building select, Save question, focus on the status text.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';
import { GROUND, drawSegmentWithTool, recordSuggestedNames, openScopeDialog } from './b2-lib.mjs';

const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();
await recordSuggestedNames(t);

const dlg = page.locator('.mep-modal');

async function openManage() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
}
async function newBuilding(name, levelName) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: 'New building…' }).click();
  const nameIn = dlg.locator('input[aria-label="Building name"]');
  await nameIn.fill(name);
  await nameIn.press('Enter');
  await dlg.locator('.mep-buildings-open-name', { hasText: name }).waitFor({ timeout: 8000 });
  await idle(500);
  await dlg.getByText('+ Add level', { exact: true }).click();
  await idle(400);
  await page.keyboard.type(levelName);
  await page.keyboard.press('Enter');
  await idle(400);
}

await t.openPdf(GROUND, 'ground.pdf');
await drawSegmentWithTool(t, { x: 300, y: 300 }, { x: 500, y: 300 });
await page.evaluate(() => window.__mepSketchScene.setCalibration({ pageUnitsPerRealUnit: 0.01 }));

await openManage();
await newBuilding('Tower', 'Ground floor');
await newBuilding('Annex', 'Basement');
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await dlg.waitFor({ state: 'hidden', timeout: 5000 });

await page.setViewportSize({ width: 800, height: 700 });
await idle(500);
await openScopeDialog(t);
const buildingSel = dlg.locator('select[aria-label="Building"]');
const levelSel = dlg.locator('select[aria-label="Level"]');
console.log('INFO building options: ' + JSON.stringify(await buildingSel.locator('option').allInnerTexts()));
const selFont = await buildingSel.evaluate((el) => getComputedStyle(el).fontFamily + ' ' + getComputedStyle(el).fontSize);
const labelFont = await dlg.locator('label, .mep-modal-body, p').first().evaluate((el) => getComputedStyle(el).fontFamily + ' ' + getComputedStyle(el).fontSize).catch(() => 'n/a');
console.log('INFO select font: ' + selFont + ' | first text font: ' + labelFont);
await dlg.locator('input[type=radio]').nth(2).check();
await shot('b3-t12c-ux-narrow-export');

// Keyboard only: focus the Building select, press ArrowDown, then read the Level select.
await buildingSel.focus();
const before = await levelSel.locator('option').allInnerTexts();
await page.keyboard.press('ArrowDown');
await idle(500);
const afterKey = await levelSel.locator('option').allInnerTexts();
console.log('INFO level options before ' + JSON.stringify(before) + ' after ArrowDown ' + JSON.stringify(afterKey) + ' building ' + (await buildingSel.inputValue()));
check(afterKey.join() !== before.join() || before.length === 1, 'ArrowDown on the Building select updates the Level select', JSON.stringify([before, afterKey]));

// Level export of the unsaved drawing: the question.
await dlg.locator('button', { hasText: /^Export$/ }).click();
const ask = page.locator('.mep-modal[aria-label="Save the drawing first"]');
await ask.waitFor({ state: 'visible', timeout: 8000 });
await idle(400);
const focused = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
console.log('INFO focused element in the question: ' + focused);
await shot('b3-t12c-ux-narrow-ask');
await page.keyboard.press('Tab');
const focusAfterTab = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '');
console.log('INFO focus after Tab: ' + focusAfterTab);
await page.keyboard.press('Escape');
await idle(600);
check((await page.locator('.mep-modal').count()) === 0, 'Escape closes the question');
check(!(await statusText()).match(/Saved|Exported/), 'Escape starts no save or export', await statusText());

// Keyboard reach of the status text at the top right.
await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
let reached = false;
for (let i = 0; i < 60 && !reached; i++) {
  await page.keyboard.press('Tab');
  reached = await page.evaluate(() => document.activeElement?.classList.contains('mep-header-status') ?? false);
}
const st = await page.evaluate(() => {
  const el = document.querySelector('.mep-header-status');
  const r = el?.getBoundingClientRect();
  return el ? { text: el.textContent, title: el.getAttribute('title'), box: r && [Math.round(r.left), Math.round(r.right), Math.round(r.top), Math.round(r.bottom)], outline: getComputedStyle(el).outlineStyle } : null;
});
console.log('INFO status: ' + JSON.stringify(st) + ' reached by Tab: ' + reached);
check(reached, 'Tab reaches the status text');
check(st && st.title === st.text, 'the status title holds the full text', JSON.stringify(st));
await shot('b3-t12c-ux-status-focus');
await t.finish();
