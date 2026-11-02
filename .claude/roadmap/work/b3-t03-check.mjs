// B3-T03: levels pane. Real typing into the name and elevation inputs, Enter and Tab, move buttons, delete, reopen the dialog.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const rows = () => dlg.locator('[data-testid="level-row"]');
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const names = async () => (await stored()).levels.map((l) => `${l.name}@${l.elevationMm}`);

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
check((await rows().count()) === 0, 'no level rows at first');
check(/No levels yet/.test(await dlg.textContent()), 'empty hint shown');
await shot('B3-T03-empty');

// Add two levels with the button; names and elevations by typing.
const add = dlg.locator('button', { hasText: /^Add level$/ });
await add.click();
await idle(300);
await add.click();
await idle(300);
check((await rows().count()) === 2, 'two rows after two clicks on Add level', String(await rows().count()));
let s = await stored();
check(s.levels[0].elevationMm === 0 && s.levels[1].elevationMm === 3000, 'new level elevations are 0 and 3000', JSON.stringify(s.levels));
check(/^Level 1$/.test(s.levels[0].name) && /^Level 2$/.test(s.levels[1].name), 'default names Level 1 and Level 2', JSON.stringify(s.levels.map((l) => l.name)));

const name0 = rows().nth(0).locator('input[aria-label="Level name"]');
await name0.fill('Ground floor');
await name0.press('Enter');
await idle(300);
const name1 = rows().nth(1).locator('input[aria-label="Level name"]');
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
const elev0 = rows().nth(0).locator('input[aria-label="Elevation (mm)"]');
await elev0.fill('-3000');
await elev0.press('Tab');
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@-3000', 'First floor@3000']), 'negative elevation saved', JSON.stringify(await names()));

// Add a third level, make its elevation equal to the second: a warning shows.
await add.click();
await idle(300);
const elev2 = rows().nth(2).locator('input[aria-label="Elevation (mm)"]');
await elev2.fill('3000');
await elev2.press('Enter');
await idle(300);
check(/same elevation/i.test(await dlg.textContent()), 'warning for equal elevations');
await shot('B3-T03-levels');
await elev2.fill('6000');
await elev2.press('Tab');
await idle(300);
check(!/same elevation/i.test(await dlg.textContent()), 'warning gone');

// Move: second level up; the first row's up button and the last row's down button are disabled.
check(await rows().nth(0).locator('button[aria-label="Move level up"]').isDisabled(), 'first row: up disabled');
check(await rows().nth(2).locator('button[aria-label="Move level down"]').isDisabled(), 'last row: down disabled');
await rows().nth(1).locator('button[aria-label="Move level up"]').click();
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['First floor@3000', 'Ground floor@-3000', 'Level 3@6000']), 'move up changes the order', JSON.stringify(await names()));
const sortBtn = dlg.locator('button', { hasText: /^Sort by elevation$/ });
check(await sortBtn.isEnabled(), 'sort enabled when the order is not ascending');
await sortBtn.click();
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@-3000', 'First floor@3000', 'Level 3@6000']), 'sort by elevation', JSON.stringify(await names()));
check(await sortBtn.isDisabled(), 'sort disabled when already ascending');

// Delete the third level.
await rows().nth(2).locator('button', { hasText: /^Delete$/ }).click();
await idle(300);
check((await rows().count()) === 2, 'delete removes the row');

// Reopen the dialog: order survives.
await closeDialog();
await openDialog();
check((await rows().count()) === 2, 'two rows after reopening the dialog');
const inputs = await rows().locator('input[aria-label="Level name"]').evaluateAll((els) => els.map((e) => e.value));
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
const delA = rows().nth(0).locator('button', { hasText: /^Delete$/ });
check(await delA.isDisabled(), 'level with a sheet: Delete disabled');
check(/1 sheet\b/.test((await delA.getAttribute('title')) ?? ''), 'disabled Delete explains why', String(await delA.getAttribute('title')));
check(await rows().nth(1).locator('button', { hasText: /^Delete$/ }).isEnabled(), 'empty level: Delete enabled');
check(/1 level\b|2 levels/.test(await dlg.textContent()) && /1 sheet\b/.test(await dlg.textContent()), 'singular sheet label');
await shot('B3-T03-blocked-delete');

await t.finish();
