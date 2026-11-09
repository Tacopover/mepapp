// B3-T13a: rename a building, no Untitled entry, no Open badge, sheets under the levels in the tree. Real DOM clicks and typing.
// Web stand-in: the dev store holds ONE building file. The test building is made in the UI, then edited as JSON and put back with store.load.
import { open } from '../browser/lib.mjs';

const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const readStore = () => page.evaluate(async () => (await window.__mepBuilding.read()).json);
const loadStore = (json) => page.evaluate((j) => window.__mepBuilding.store.load(j), json);
const activeKind = () => page.evaluate(() => document.activeElement?.getAttribute('data-kind') ?? '');
const activeText = () => page.evaluate(() => (document.activeElement?.textContent ?? '').trim());

async function buildingMenu(item) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: item }).click();
  await idle(300);
}
async function headerName() {
  return ((await dlg.locator('[data-testid="building-name-header-text"]').textContent()) ?? '').trim();
}

await page.setViewportSize({ width: 1600, height: 900 });

// No PDF is open: the Add files strip must not list an Untitled document.
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(700);
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameIn = dlg.locator('input[aria-label="Building name"]');
await nameIn.fill('Tower');
await nameIn.press('Enter');
await dlg.locator('[data-testid="building-name-header-text"]', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
await page.keyboard.type('Ground floor');
await page.keyboard.press('Enter');
await idle(400);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
await page.keyboard.type('Level 1');
await page.keyboard.press('Enter');
await idle(300);
const elev = dlg.locator('input[aria-label="Elevation (mm)"]');
await elev.fill('3000');
await elev.press('Enter');
await idle(500);

const strip = dlg.locator('[data-testid="open-documents"]');
const toggle = dlg.locator('[data-testid="open-docs-toggle"]');
check((await toggle.textContent())?.includes('(0)') === true, 'the open-documents count is 0 with no PDF open', await toggle.textContent());
if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
await idle(300);
check(((await strip.textContent()) ?? '').includes('No PDF is open in the viewer.'), 'the strip says "No PDF is open in the viewer."');
check(!((await strip.textContent()) ?? '').includes('Untitled'), 'no Untitled entry in the strip');
check((await dlg.locator('[data-testid="open-doc-row"]').count()) === 0, 'no open-document row with no PDF open');
await strip.scrollIntoViewIfNeeded();
await shot('b3-t13a-4');

// Edit the JSON: sheets on both levels (paths do not exist, so the rows are Missing).
const tower = JSON.parse(await readStore());
const g = tower.levels.find((l) => l.name === 'Ground floor');
const l1 = tower.levels.find((l) => l.name === 'Level 1');
const sheet = (id, levelId, fileName, page) => ({ id, levelId, projectUuid: null, pageIndex: page, displayName: fileName, location: { fileName, path: fileName } });
tower.sheets = [
  sheet('sx-g-0', g.id, 'ground-plan.pdf', 0),
  sheet('sx-g-1', g.id, 'ground-multi.pdf', 0),
  sheet('sx-g-2', g.id, 'ground-multi.pdf', 2),
  sheet('sx-l-0', l1.id, 'level-one-plan-with-a-very-long-name-for-the-ellipsis-test-revision-C-final-issue.pdf', 0),
];
const towerJson = JSON.stringify(tower);
await buildingMenu('New building…');
const n2 = dlg.locator('input[aria-label="Building name"]');
await n2.fill('Annex');
await n2.press('Enter');
await dlg.locator('[data-testid="building-name-header-text"]', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(500);
await loadStore(towerJson);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('[data-testid="building-name-header-text"]', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(1500);

// No Open badge in the tree.
check((await dlg.locator('.mep-tree-badge').count()) === 0, 'no Open badge element in the tree');
const treeWords = await dlg.locator('.mep-tree').evaluate((el) => [...el.querySelectorAll('*')].filter((e) => e.children.length === 0 && (e.textContent ?? '').trim() === 'Open').length);
check(treeWords === 0, 'no tree element has the text "Open"', String(treeWords));

// Levels are collapsed by default.
check((await items('sheet').count()) === 0, 'no sheet node is shown by default (levels collapsed)');
const gItem = items('level').filter({ hasText: 'Ground floor' });
const lItem = items('level').filter({ hasText: 'Level 1' });
check((await gItem.getAttribute('aria-expanded')) === 'false', 'Ground floor has aria-expanded=false');
check((await lItem.getAttribute('aria-expanded')) === 'false', 'Level 1 has aria-expanded=false');
check((await dlg.locator('[role="tree"]').count()) === 1, 'one element has role=tree');
await shot('b3-t13a-1');

// Select Level 1, then expand Ground floor with its arrow: the selection does not change.
await lItem.click();
await idle(500);
check((await lItem.getAttribute('aria-selected')) === 'true', 'Level 1 is selected');
const gArrow = gItem.locator('button.mep-tree-arrow');
check((await gArrow.getAttribute('aria-hidden')) === 'true' && (await gArrow.count()) === 1, 'Ground floor has its own arrow button (hidden from the tree item name)');
await gArrow.click();
await idle(400);
check((await gItem.getAttribute('aria-expanded')) === 'true', 'Ground floor expanded by its arrow');
check((await lItem.getAttribute('aria-selected')) === 'true', 'the arrow click does not change the selection');
const sheetItems = items('sheet');
check((await sheetItems.count()) === 3, 'Ground floor shows 3 sheet nodes', String(await sheetItems.count()));
const sheetTexts = await sheetItems.allInnerTexts();
console.log('INFO sheet nodes: ' + JSON.stringify(sheetTexts));
check(sheetTexts.some((x) => x.includes('ground-plan.pdf')) && sheetTexts.filter((x) => x.includes('ground-multi.pdf')).length === 2, 'the PDF names are shown under the level');
check(sheetTexts.some((x) => x.includes('p. 3')) && sheetTexts.some((x) => x.includes('p. 1')), 'pages of one PDF show "p. N"', JSON.stringify(sheetTexts));
check((await sheetItems.first().getAttribute('aria-level')) === '3', 'a sheet node has aria-level 3');
check((await lItem.getAttribute('aria-expanded')) === 'false', 'Level 1 stays collapsed');
check((await dlg.locator('[data-kind="sheet"] .mep-tree-dot').count()) === 3, 'sheets with a missing PDF show the status dot', String(await dlg.locator('[data-kind="sheet"] .mep-tree-dot').count()));
await shot('b3-t13a-2');

// A sheet node click selects its level and highlights the row in the right pane.
await sheetItems.nth(1).click();
await idle(600);
check((await gItem.getAttribute('aria-selected')) === 'true', 'a click on a sheet node selects its level');
const lit = dlg.locator('[data-testid="page-row"][data-highlight="true"]');
check((await lit.count()) === 1, 'one sheet row is highlighted in the right pane', String(await lit.count()));
check(((await lit.first().textContent()) ?? '').includes('ground-multi.pdf'), 'the highlighted row is the clicked sheet');

// The arrow collapses again.
await gArrow.click();
await idle(400);
check((await items('sheet').count()) === 0, 'the arrow collapses the level again');
check((await gItem.getAttribute('aria-expanded')) === 'false', 'Ground floor has aria-expanded=false after collapse');

// The state of a level stays while the dialog is open: expand Level 1 and Ground floor, switch selection, both stay.
await lItem.locator('button.mep-tree-arrow').click();
await gArrow.click();
await idle(300);
await items('level').filter({ hasText: 'Ground floor' }).click();
await idle(300);
check((await items('sheet').count()) === 4, 'both levels stay expanded after a selection change', String(await items('sheet').count()));
const longNode = items('sheet').filter({ hasText: 'level-one-plan' });
const cut = await longNode.locator('.mep-tree-label').evaluate((el) => el.scrollWidth > el.clientWidth + 1);
check(cut && ((await longNode.locator('.mep-tree-label').getAttribute('title')) ?? (await longNode.getAttribute('title')) ?? '').includes('level-one-plan'), 'a long sheet name is cut with an ellipsis and has a title');
await lItem.locator('button.mep-tree-arrow').click();
await gArrow.click();
await idle(300);

// Keyboard: ArrowRight, ArrowDown, ArrowLeft.
await gItem.focus();
await page.keyboard.press('ArrowRight');
await idle(300);
check((await gItem.getAttribute('aria-expanded')) === 'true', 'ArrowRight expands the level');
check((await activeText()).includes('Ground floor'), 'the focus stays on the level after ArrowRight');
await page.keyboard.press('ArrowDown');
await idle(200);
check((await activeKind()) === 'sheet', 'ArrowDown walks into the first sheet node');
await page.keyboard.press('ArrowLeft');
await idle(200);
check((await activeKind()) === 'level', 'ArrowLeft on a sheet node moves to its level');
await page.keyboard.press('ArrowLeft');
await idle(300);
check((await gItem.getAttribute('aria-expanded')) === 'false', 'ArrowLeft on the expanded level collapses it');
await page.keyboard.press('End');
await idle(200);
check((await page.evaluate(() => document.activeElement?.getAttribute('role') ?? '')) === 'treeitem', 'End still moves the focus to a tree item');

// Rename in the header: click Rename, type, Enter.
const renameBtn = dlg.locator('[data-testid="building-name-header-rename"]');
check((await renameBtn.count()) === 1 && ((await renameBtn.textContent()) ?? '').trim() === 'Rename', 'the header has a Rename button next to the name');
await renameBtn.click();
await idle(200);
const input = dlg.locator('[data-testid="building-name-header-input"]');
check((await input.count()) === 1, 'Rename turns the name into an input');
check(await input.evaluate((el) => document.activeElement === el && el.selectionStart === 0 && el.selectionEnd === el.value.length), 'the input has the focus and its text is selected');
await shot('b3-t13a-3');
await page.keyboard.type('Tower B');
await page.keyboard.press('Enter');
await idle(600);
check((await headerName()) === 'Tower B', 'the header shows the new name', await headerName());
check((await items('building').filter({ hasText: 'Tower B' }).count()) === 1, 'the tree shows the new name at once');
const recent = await page.evaluate(() => Object.entries(localStorage).filter(([, v]) => v.includes('Tower B')).map(([k]) => k));
check(recent.length > 0, 'the recent list stores the new name', JSON.stringify(recent));
const saved = JSON.parse(await readStore());
check(saved.name === 'Tower B', 'the building file stores the new name', saved.name);

// Escape cancels.
await renameBtn.click();
await idle(200);
await page.keyboard.type('Discard me');
await page.keyboard.press('Escape');
await idle(300);
check((await dlg.count()) === 1, 'Escape in the rename input does not close the dialog');
check((await headerName()) === 'Tower B', 'Escape cancels the rename', await headerName());

// Empty is refused.
await renameBtn.click();
await idle(200);
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');
await page.keyboard.press('Enter');
await idle(300);
const alertText = await dlg.locator('.mep-name-error').first().textContent().catch(() => '');
check((alertText ?? '').includes('needs a name'), 'an empty name shows a short message', alertText ?? '');
check((await input.count()) === 1, 'the input stays open after an empty Enter');
await page.keyboard.press('Escape');
await idle(300);
check((await headerName()) === 'Tower B', 'the name is unchanged after the refused rename', await headerName());

// Blur saves.
await renameBtn.click();
await idle(200);
await page.keyboard.type('Tower C');
await dlg.locator('.mep-modal-title').click();
await idle(500);
check((await headerName()) === 'Tower C', 'blur saves the new name', await headerName());

// The building view (no level selected) has its own Rename button.
await dlg.locator('[role="treeitem"][data-kind="building"]', { hasText: 'Tower C' }).click();
await idle(500);
const paneRename = dlg.locator('[data-testid="building-name-pane-rename"]');
check((await paneRename.count()) === 1, 'the Building view has a Rename button');
await paneRename.click();
await idle(200);
await page.keyboard.type('Tower D');
await page.keyboard.press('Enter');
await idle(500);
check((await headerName()) === 'Tower D', 'a rename in the Building view updates the header', await headerName());

// Two buildings with one name show a quiet warning.
await dlg.locator('[data-testid="building-name-header-rename"]').click();
await idle(200);
await page.keyboard.type('Annex');
await page.keyboard.press('Enter');
await idle(500);
check((await dlg.locator('[data-testid="building-name-header-warning"]').count()) === 1, 'a name that another building has shows a quiet warning');
await dlg.locator('[data-testid="building-name-header-rename"]').click();
await idle(200);
await page.keyboard.type('Tower');
await page.keyboard.press('Enter');
await idle(500);
check((await dlg.locator('[data-testid="building-name-header-warning"]').count()) === 0, 'the warning goes away with a unique name');


// After a mouse click on an arrow the keyboard still works (focus moves to the tree item).
await items('level').filter({ hasText: 'Ground floor' }).locator('button.mep-tree-arrow').click();
await idle(300);
check((await activeKind()) === 'level', 'after an arrow click the focus sits on the tree item', await activeKind());
await page.keyboard.press('ArrowDown');
await idle(200);
check((await activeKind()) === 'sheet', 'ArrowDown works after an arrow click');
// Enter in the rename input gives the focus back to the Rename button.
await dlg.locator('[data-testid="building-name-header-rename"]').click();
await idle(200);
await page.keyboard.type('Tower E');
await page.keyboard.press('Enter');
await idle(500);
check(await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'building-name-header-rename'), 'after Enter the Rename button has the focus');
await t.finish();
