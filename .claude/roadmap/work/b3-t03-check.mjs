// B3-T03: levels pane. Real typing into the name and elevation inputs, Enter and Tab, move buttons, delete, reopen the dialog.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const row = () => dlg.locator('[data-testid="level-row"]');
const pick = async (i) => { await items('level').nth(i).click(); await idle(300); };
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const names = async () => (await stored()).levels.map((l) => `${l.name}@${l.elevationMm}`);
const treeNames = () => items('level').locator('.mep-tree-label').allInnerTexts();

async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(300);
}
async function closeDialog() {
  await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
  await idle(300);
}

await openDialog();
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Tower');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
check((await items('level').count()) === 0, 'no level rows at first');
check(/No levels yet/.test(await dlg.textContent()), 'empty hint shown');
await shot('B3-T03-empty');

// Add two levels with the button; names and elevations by typing.
const add = dlg.locator('[data-testid="tree-add-level"]');
await add.click();
await idle(300);
await add.click();
await idle(300);
check((await items('level').count()) === 2, 'two rows after two clicks on Add level', String(await items('level').count()));
let s = await stored();
check(s.levels[0].elevationMm === 0 && s.levels[1].elevationMm === 3000, 'new level elevations are 0 and 3000', JSON.stringify(s.levels));
check(/^Level 1$/.test(s.levels[0].name) && /^Level 2$/.test(s.levels[1].name), 'default names Level 1 and Level 2', JSON.stringify(s.levels.map((l) => l.name)));

await pick(0);
const name0 = row().locator('input[aria-label="Level name"]');
await name0.fill('Ground floor');
await name0.press('Enter');
await idle(300);
await pick(1);
const name1 = row().locator('input[aria-label="Level name"]');
await name1.fill('First floor');
await name1.press('Tab');
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3000']), 'names saved by Enter and by Tab', JSON.stringify(await names()));

// A blank name is refused and the old name comes back.
await name1.fill('');
await name1.press('Enter');
await idle(300);
check((await name1.inputValue()) === 'First floor', 'blank name resets to the saved name', await name1.inputValue());

// Escape drops the draft and does not close the dialog.
await name1.fill('zzz');
await name1.press('Escape');
await idle(300);
check((await dlg.count()) === 1, 'Escape in the name box keeps the dialog open');
check((await name1.inputValue()) === 'First floor', 'Escape resets the draft', await name1.inputValue());

// Elevation by typing, then Tab; a negative value.
await pick(0);
const elev0 = row().locator('input[aria-label="Elevation (mm)"]');
await elev0.fill('-3000');
await elev0.press('Tab');
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@-3000', 'First floor@3000']), 'negative elevation saved', JSON.stringify(await names()));

// Add a third level, make its elevation equal to the second: a warning shows.
await add.click();
await idle(300);
const elev2 = row().locator('input[aria-label="Elevation (mm)"]');
await elev2.fill('3000');
await elev2.press('Enter');
await idle(300);
check(/same elevation/i.test(await dlg.textContent()), 'warning for equal elevations');
await shot('B3-T03-levels');
await elev2.fill('6000');
await elev2.press('Tab');
await idle(300);
check(!/same elevation/i.test(await dlg.textContent()), 'warning gone');

// Order: the levels follow their elevation. The third level moves to the top and back.
await pick(2);
const elevTop = row().locator('input[aria-label="Elevation (mm)"]');
await elevTop.fill('-6000');
await elevTop.press('Enter');
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['Level 3@-6000', 'Ground floor@-3000', 'First floor@3000']), 'a lower elevation moves the level up in the file', JSON.stringify(await names()));
check(JSON.stringify(await treeNames()) === JSON.stringify(['Level 3', 'Ground floor', 'First floor']), 'the tree follows the elevation order', JSON.stringify(await treeNames()));
check((await row().locator('button[aria-label^="Move level"]').count()) === 0, 'no Move level buttons');
check((await dlg.locator('button', { hasText: /^Sort by elevation$/ }).count()) === 0, 'no Sort by elevation button');
await elevTop.fill('6000');
await elevTop.press('Enter');
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@-3000', 'First floor@3000', 'Level 3@6000']), 'a higher elevation moves the level down again', JSON.stringify(await names()));
check((await elevTop.inputValue()) === '6000', 'the elevation field shows 6000');

// Delete the third level.
await pick(2);
await row().locator('button', { hasText: /^Delete$/ }).click();
await idle(300);
check((await items('level').count()) === 2, 'delete removes the row');

// Reopen the dialog: order survives.
await closeDialog();
await openDialog();
check((await items('level').count()) === 2, 'two rows after reopening the dialog');
const inputs = await items('level').locator('.mep-tree-label').allInnerTexts();
check(JSON.stringify(inputs) === JSON.stringify(['Ground floor', 'First floor']), 'order after reopening', JSON.stringify(inputs));
check(/2 levels/.test(await dlg.textContent()), '"2 levels" in the summary line');

// A level with a sheet cannot be deleted: load a building with a sheet through the dev hook.
await page.evaluate(async () => {
  await window.__mepBuilding.load(JSON.stringify({
    schemaVersion: 1, id: 'b-s', name: 'With sheet',
    levels: [{ id: 'a', name: 'A', elevationMm: 0 }, { id: 'b', name: 'B', elevationMm: 3000 }],
    sheets: [{ id: 's1', levelId: 'a', projectUuid: 'u1', pageIndex: 0, displayName: 'P1', location: { fileName: 'p.pdf' } }],
    risers: [],
  }));
});
await idle(400);
await pick(0);
const delA = row().locator('button', { hasText: /^Delete$/ });
check(await delA.isDisabled(), 'level with a sheet: Delete disabled');
check(/Remove its 1 sheet first/.test((await dlg.locator('[data-testid="delete-reason"]').textContent()) ?? ''), 'disabled Delete explains why', String(await dlg.locator('[data-testid="delete-reason"]').textContent()));
await pick(1);
check(await row().locator('button', { hasText: /^Delete$/ }).isEnabled(), 'empty level: Delete enabled');
check(/1 level\b|2 levels/.test(await dlg.textContent()) && /1 sheet\b/.test(await dlg.textContent()), 'singular sheet label');
await shot('B3-T03-blocked-delete');

await t.finish();
