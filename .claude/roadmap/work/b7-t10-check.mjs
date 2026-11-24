// B7-T10: editing a terminal capacity marks the document as changed.
// Two stamps from real clicks. Each edit is typed into the real Capacity input (fill, Enter). The dirty state is read from the real UI:
// the changed dot of the document switcher (.mep-doc-dirty-dot) and the close question (the window confirm of the close button).
import { open } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/lib.mjs';
import { placeOneStamp } from '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/browser/r3-lib.mjs';

const SHOTS = '/root/MepApp/.claude/worktrees/buildings-b7/.claude/roadmap/work/shots/b7-t10/';
const t = await open();
const { page, check, idle, menu, until, statusText } = t;
await t.start();
await t.openPdf();
await placeOneStamp(t, { x: 650, y: 500 });
await placeOneStamp(t, { x: 850, y: 500 });

const dots = () => page.locator('.mep-doc-switcher > .mep-doc-dirty-dot').count();
const capacities = () => page.evaluate(() => window.__mepSketchScene.exportProject().terminalCapacities ?? {});
const stampIds = () => page.evaluate(() => window.__mepSketchScene.exportProject().stamps.map((s) => s.id));
async function save(label) {
  await page.locator('button.mep-menu-btn').click();
  const enabled = await page.locator('button.mep-menu-item', { hasText: /^\s*Save\s*$/ }).isEnabled();
  await idle(200);
  if (!enabled) {
    await page.locator('button.mep-menu-btn').click();
    return false;
  }
  await page.locator('button.mep-menu-item', { hasText: /^\s*Save\s*$/ }).click();
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
}
async function selectAt(x, y, shift = false) {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(x, y);
  if (shift) await page.keyboard.up('Shift');
  await idle(400);
}
const capacityInput = () => page.locator('.mep-field-row', { has: page.locator('label', { hasText: /^Capacity/ }) }).locator('input[type="number"]').first();
async function typeCapacity(value) {
  const input = capacityInput();
  await input.fill(String(value));
  await input.press('Enter');
  await idle(400);
}
async function closeQuestion() {
  let message = null;
  page.once('dialog', async (d) => {
    message = d.message();
    await d.dismiss();
  });
  await page.locator('.mep-dock-tab-label', { hasText: /^Drawings$/ }).click();
  await idle(300);
  await page.locator('.mep-dock-body .mep-doc-close').first().click();
  await idle(600);
  await page.locator('.mep-dock-tab-label', { hasText: /^Properties$/ }).click();
  await idle(300);
  return message;
}

const ids = await stampIds();
check(ids.length === 2, 'two stamps are placed', JSON.stringify(ids));
await save('start');
check((await dots()) === 0, 'start: the document is saved, no changed mark');

// 1. one stamp, real input
await selectAt(650, 500);
await typeCapacity(250);
check((await capacities())[ids[0]] === 250 || Object.values(await capacities()).includes(250), 'one stamp: the capacity 250 is stored', JSON.stringify(await capacities()));
check((await dots()) === 1, 'one stamp: after typing 250 and Enter the changed mark shows');
const q1 = await closeQuestion();
check(typeof q1 === 'string' && /unsaved changes/.test(q1), 'one stamp: the close button asks the unsaved-changes question', String(q1));
await t.shot('b7-t10-1-changed');
await save('after one stamp');
check((await dots()) === 0, 'one stamp: after Save the changed mark is gone');

// 2. several stamps, real input
await selectAt(650, 500);
await selectAt(850, 500, true);
check((await page.locator('b', { hasText: /2 elements selected/ }).count()) === 1, 'two stamps are selected');
await typeCapacity(80);
const caps = Object.values(await capacities());
check(caps.filter((c) => c === 80).length === 2, 'two stamps: both have capacity 80', JSON.stringify(await capacities()));
check((await dots()) === 1, 'two stamps: after typing 80 and Enter the changed mark shows');
await t.shot('b7-t10-2-changed-multi');
await save('after two stamps');
check((await dots()) === 0, 'two stamps: after Save the changed mark is gone');

// 3. the same value again does not mark the document as changed (scene call, because the input does not fire for an equal value)
await page.evaluate((id) => window.__mepSketchScene.setTerminalCapacity(id, 80), ids[0]);
await idle(300);
check((await dots()) === 0, 'same value (one stamp): no changed mark');
await page.evaluate(() => window.__mepSketchScene.setCapacityForSelection(80));
await idle(300);
check((await dots()) === 0, 'same value (selection): no changed mark');
await page.evaluate((id) => window.__mepSketchScene.setTerminalCapacity(id, 81), ids[0]);
await idle(300);
check((await dots()) === 1, 'a different value marks the document as changed');

check(/unsaved changes/.test(String(await closeQuestion())), 'a changed value: the close button asks the unsaved-changes question');
await save('end');
check((await dots()) === 0, 'end: after Save the changed mark is gone');
check((await closeQuestion()) === null, 'end: after Save the close button asks nothing (the document closes)');
await t.finish();
