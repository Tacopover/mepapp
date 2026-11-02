// B3-T11d: levels in the tree. Real clicks, typing, Enter, Tab, keyboard. Add level in the tree, level detail, delete with Undo, blocked delete reason, sort reason.
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const treeLevels = () => dlg.locator('[role="treeitem"][data-kind="level"]');
const addItem = () => dlg.locator('[data-testid="tree-add-level"]');
const detail = () => dlg.locator('[data-testid="level-row"]');
const nameBox = () => detail().locator('input[aria-label="Level name"]');
const elevBox = () => detail().locator('input[aria-label="Elevation (mm)"]');
const delBtn = () => detail().locator('button', { hasText: /^Delete$/ });
const sortBtn = () => dlg.locator('button', { hasText: /^Sort by elevation$/ });
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const names = async () => (await stored()).levels.map((l) => `${l.name}@${l.elevationMm}`);
const treeNames = () => treeLevels().locator('.mep-tree-label').allInnerTexts();
const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName ?? '', label: a?.getAttribute('aria-label') ?? '', text: (a?.textContent ?? '').trim().slice(0, 30), sel: a && 'selectionStart' in a ? [a.selectionStart, a.selectionEnd, a.value] : null };
});

async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
}

await openDialog();
await dlg.locator('button', { hasText: /^New building$/ }).click();
const bName = dlg.locator('input[aria-label="Building name"]');
await bName.fill('Tower');
await bName.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(400);

// Empty building: hint, no table, one add item in the tree.
check(/No levels yet\. Use \+ Add level\./.test((await dlg.textContent()) ?? ''), 'empty: hint points to + Add level');
check((await addItem().count()) === 1, 'tree: one + Add level item');
check((await detail().count()) === 0, 'empty: no level detail');
check((await dlg.locator('button', { hasText: /^Add level$/ }).count()) === (await dlg.locator('[data-testid="open-documents"] button', { hasText: /^Add level$/ }).count()), 'no Add level button in the right pane outside the open documents section (T11f)');
await shot('B3-T11d-empty');

// Add level 1: selected, name field focused, default name selected.
await addItem().click();
await idle(500);
check((await treeLevels().count()) === 1, 'tree: 1 level after one click', String(await treeLevels().count()));
check((await treeLevels().first().getAttribute('aria-selected')) === 'true', 'new level is selected');
check((await detail().count()) === 1, 'detail shows exactly one level row');
let a = await active();
check(a.tag === 'INPUT' && a.label === 'Level name', 'focus is in the name field', JSON.stringify(a));
check(a.sel !== null && a.sel[0] === 0 && a.sel[1] === a.sel[2].length && a.sel[2] === 'Level 1', 'default name "Level 1" is selected', JSON.stringify(a.sel));
await page.keyboard.type('Ground floor');
await page.keyboard.press('Enter');
await idle(400);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0']), 'Enter saves the typed name', JSON.stringify(await names()));
check(JSON.stringify(await treeNames()) === JSON.stringify(['Ground floor']), 'tree shows the new name', JSON.stringify(await treeNames()));

// Add level 2: type the name, Tab saves it and goes to the elevation field.
await addItem().click();
await idle(500);
a = await active();
check(a.label === 'Level name' && a.sel?.[2] === 'Level 2', 'second add: name field focused with "Level 2"', JSON.stringify(a));
await page.keyboard.type('First floor');
await page.keyboard.press('Tab');
await idle(400);
a = await active();
check(a.label === 'Elevation (mm)', 'Tab goes from name to elevation', JSON.stringify(a));
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3000']), 'Tab saved the name; default elevation 3000', JSON.stringify(await names()));
await elevBox().fill('3500');
await page.keyboard.press('Tab');
await idle(400);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3500']), 'elevation typed and saved by Tab', JSON.stringify(await names()));
a = await active();
check(a.label === 'Move level up', 'Tab order after elevation: Move level up', JSON.stringify(a));
await page.keyboard.press('Tab');
a = await active();
check(a.label === 'Move level down', 'Tab order: Move level down stays in the Tab order (aria-disabled on the last level)', JSON.stringify(a));
check((await elevBox().inputValue()) === '3500', 'elevation field shows the value');

// Escape in the name field keeps the dialog.
await nameBox().fill('zzz');
await nameBox().press('Escape');
await idle(300);
check((await dlg.count()) === 1, 'Escape in the name field keeps the dialog open');
check((await nameBox().inputValue()) === 'First floor', 'Escape drops the draft');

// Move up by button: order in the tree and in the file; the level stays selected.
check(await detail().locator('button[aria-label="Move level down"]').isDisabled(), 'last level: down disabled');
await detail().locator('button[aria-label="Move level up"]').click();
await idle(400);
check(JSON.stringify(await treeNames()) === JSON.stringify(['First floor', 'Ground floor']), 'tree shows the order of the file after Move up', JSON.stringify(await treeNames()));
check((await treeLevels().first().getAttribute('aria-selected')) === 'true', 'moved level stays selected');
// Alt+ArrowDown in the tree moves the level down again.
await treeLevels().first().focus();
await page.keyboard.press('Alt+ArrowDown');
await idle(400);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3500']), 'Alt+ArrowDown in the tree moves the level down', JSON.stringify(await names()));
await idle(200);
a = await active();
check(a.tag === 'DIV' && /First floor/.test(a.text), 'focus stays on the moved level in the tree', JSON.stringify(a));

// Sort: disabled with a reason when sorted; enabled when not.
check((await sortBtn().getAttribute('aria-disabled')) === 'true', 'sort: aria-disabled when the order is by elevation');
check(/Levels are already in order of elevation\./.test((await dlg.locator('[data-testid="sort-reason"]').textContent()) ?? ''), 'sort: reason text visible');
await sortBtn().click({ force: true });
await idle(300);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3500']), 'click on disabled sort changes nothing');
await detail().locator('button[aria-label="Move level up"]').click();
await idle(300);
await treeLevels().nth(1).click();
await idle(300);
await detail().locator('button[aria-label="Move level up"]').click();
await idle(400);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3500']), 'moves back to the elevation order', JSON.stringify(await names()));
await treeLevels().nth(0).click();
await idle(300);
await detail().locator('button[aria-label="Move level down"]').click();
await idle(400);
check((await sortBtn().getAttribute('aria-disabled')) !== 'true', 'sort: enabled when the order is not by elevation');
check((await dlg.locator('[data-testid="sort-reason"]').count()) === 0, 'sort: no reason text when enabled');
await sortBtn().click();
await idle(400);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3500']), 'sort by elevation works', JSON.stringify(await names()));

// Delete an empty level: no confirm, Undo line, next level selected; Undo restores at the same place.
await addItem().click();
await idle(500);
await page.keyboard.type('Roof');
await page.keyboard.press('Enter');
await idle(400);
await treeLevels().nth(1).click();
await idle(300);
check((await dlg.locator('[data-testid="delete-reason"]').count()) === 0, 'empty level: no reason text');
await delBtn().click();
await idle(500);
check((await treeLevels().count()) === 2, 'delete: 2 levels left in the tree', String(await treeLevels().count()));
check((await stored()).levels.length === 2, 'delete: 2 levels in the file');
const undo = dlg.locator('[data-testid="level-undo"]');
check((await undo.count()) === 1 && /First floor/.test((await undo.textContent()) ?? ''), 'delete: Undo line names the level', (await undo.textContent().catch(() => '')) ?? '');
await shot('B3-T11d-undo-line');
await undo.locator('button', { hasText: /^Undo$/ }).click();
await idle(500);
check(JSON.stringify(await names()) === JSON.stringify(['Ground floor@0', 'First floor@3500', 'Roof@6500']), 'Undo restores the level at its place', JSON.stringify(await names()));
check((await undo.count()) === 0, 'Undo line is gone after Undo');
check((await treeLevels().nth(1).getAttribute('aria-selected')) === 'true', 'restored level is selected');

// The Undo line expires after 8 s.
await treeLevels().nth(2).click();
await idle(300);
await delBtn().click();
await idle(500);
check((await undo.count()) === 1, 'Undo line shows after the second delete');
await page.waitForTimeout(8600);
check((await undo.count()) === 0, 'Undo line is gone after 8 s');
check((await treeLevels().count()) === 2, 'level stays deleted after the line expires');

// Reopen: order survives.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(300);
await openDialog();
check(JSON.stringify(await treeNames()) === JSON.stringify(['Ground floor', 'First floor']), 'order after reopening', JSON.stringify(await treeNames()));

// Blocked delete: visible reason, stays in the Tab order, click does nothing.
await page.evaluate(async () => {
  await window.__mepBuilding.load(JSON.stringify({
    schemaVersion: 1, id: 'b-s', name: 'With sheets',
    levels: [{ id: 'a', name: 'A', elevationMm: 0 }, { id: 'b', name: 'B', elevationMm: 3000 }, { id: 'c', name: 'C', elevationMm: 6000 }],
    sheets: [
      { id: 's1', levelId: 'a', projectUuid: 'u1', pageIndex: 0, displayName: 'P1', location: { fileName: 'p.pdf' } },
      { id: 's2', levelId: 'c', projectUuid: 'u2', pageIndex: 0, displayName: 'P2', location: { fileName: 'q.pdf' } },
      { id: 's3', levelId: 'c', projectUuid: 'u3', pageIndex: 0, displayName: 'P3', location: { fileName: 'r.pdf' } },
    ],
    risers: [],
  }));
});
await idle(500);
await treeLevels().nth(0).click();
await idle(300);
check((await delBtn().getAttribute('aria-disabled')) === 'true' && (await delBtn().isDisabled()), 'level with 1 sheet: Delete is aria-disabled');
check(/Remove its 1 sheet first/.test((await dlg.locator('[data-testid="delete-reason"]').textContent()) ?? ''), 'reason text: Remove its 1 sheet first');
await detail().locator('button[aria-label="Move level down"]').focus();
await page.keyboard.press('Tab');
a = await active();
check(a.text === 'Delete', 'blocked Delete stays in the Tab order', JSON.stringify(a));
await page.keyboard.press('Enter');
await idle(300);
check((await treeLevels().count()) === 3 && (await dlg.locator('[data-testid="level-undo"]').count()) === 0, 'Enter on blocked Delete deletes nothing');
await shot('B3-T11d-blocked-delete');
await treeLevels().nth(2).click();
await idle(300);
check(/Remove its 2 sheets first/.test((await dlg.locator('[data-testid="delete-reason"]').textContent()) ?? ''), 'reason text: Remove its 2 sheets first');
await treeLevels().nth(1).click();
await idle(300);
check((await delBtn().getAttribute('aria-disabled')) !== 'true', 'empty level: Delete is enabled');
await shot('B3-T11d-wide-detail');

// Narrow window.
await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
await shot('B3-T11d-narrow');
const clipped = await page.evaluate(() => {
  const modal = document.querySelector('.mep-modal').getBoundingClientRect();
  const bad = [];
  for (const el of document.querySelectorAll('.mep-modal [data-testid="level-row"] button, .mep-modal [data-testid="level-row"] input')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    if (r.left < modal.left - 1 || r.right > modal.right + 1) bad.push(el.getAttribute('aria-label') ?? el.textContent);
  }
  return bad;
});
check(clipped.length === 0, 'narrow: level controls stay inside the dialog', JSON.stringify(clipped));

await t.finish();
