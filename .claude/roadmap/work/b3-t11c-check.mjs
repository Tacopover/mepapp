// B3-T11c: new Manage Buildings shell: tree, building switcher, Building menu, keyboard, fixed size, narrow select. Real clicks and typing.
// Web dev stand-in: the dev building store holds ONE building file. To switch to a building through the tree, the check first puts that building's JSON into the store (store.load) and then clicks the tree item once.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const readStore = () => page.evaluate(async () => (await window.__mepBuilding.read()).json);
const loadStore = (json) => page.evaluate((j) => window.__mepBuilding.store.load(j), json);
const rect = () => page.evaluate(() => {
  const r = document.querySelector('.mep-modal').getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
});
const active = () => page.evaluate(() => {
  const a = document.activeElement;
  return { role: a?.getAttribute('role') ?? '', key: a?.getAttribute('data-key') ?? '', tag: a?.tagName ?? '', label: a?.getAttribute('aria-label') ?? '', text: (a?.textContent ?? '').slice(0, 40) };
});
const b64 = (file) => readFileSync(FIX + file).toString('base64');

async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
}
async function reloadPage() {
  await page.reload();
  await page.locator('button.mep-onboarding-start').click({ timeout: 30000 }).catch(() => {});
  await page.waitForFunction(() => window.__mepSketchScene !== undefined);
}
async function closeByEscape() {
  await page.keyboard.press('Escape');
  await idle(300);
}
async function buildingMenu(item) {
  await dlg.locator('button.mep-menu-btn').click();
  await dlg.locator('[role="menuitem"]', { hasText: item }).click();
  await idle(200);
}
async function saveActive(label) {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
  check(/^Saved /.test(await statusText()), `${label} saved (stamped with a document id)`, await statusText());
}
/** Controls that stick out of the dialog (or, inside the scroll panel, out of its width). */
async function clipped() {
  return page.evaluate(() => {
    const modal = document.querySelector('.mep-modal').getBoundingClientRect();
    const panel = document.querySelector('.mep-buildings-panel');
    const panelRect = panel?.getBoundingClientRect();
    const bad = [];
    for (const el of document.querySelectorAll('.mep-modal button, .mep-modal input, .mep-modal select')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.closest('.mep-tree-item') && getComputedStyle(el).visibility === 'hidden') continue;
      const name = `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.slice(0, 20)}`;
      if (r.left < modal.left - 1 || r.right > modal.right + 1) bad.push(`${name} x`);
      else if (panel && panel.contains(el)) {
        if (r.left < panelRect.left - 1 || r.right > panelRect.right + 1) bad.push(`${name} panel-x`);
      } else if (r.top < modal.top - 1 || r.bottom > modal.bottom + 1) bad.push(`${name} y`);
    }
    return bad;
  });
}

// Step 0: a saved document, so that the active sheet can match a sheet of the building later.
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'ground.pdf');
await saveActive('ground.pdf');

// Step 1: no building open.
await openDialog();
let text = (await dlg.textContent()) ?? '';
check(/No building is open\. Create a building or open a building file\./.test(text), 'no building: the empty text shows');
check((await dlg.locator('button', { hasText: /^New building$/ }).count()) === 1, 'no building: one New building button');
check((await dlg.locator('button', { hasText: /^Open building…$/ }).count()) === 1, 'no building: one Open building… button');
check((await dlg.locator('.mep-modal-actions button').count()) === 1, 'footer holds one button');
let a = await active();
check(a.tag === 'BUTTON' && a.text === 'New building', 'no building, no recent: the focus is on New building', JSON.stringify(a));
let r0 = await rect();
check(r0.w === 1100 && r0.h === 760, 'fixed size 1100x760 at 1600x1000', JSON.stringify(r0));
await dlg.locator('button.mep-menu-btn').click();
check((await dlg.locator('[role="menuitem"]', { hasText: /^Close building$/ }).count()) === 0, 'menu: no Close building item');
check((await dlg.locator('[role="menuitem"]').count()) === 2, 'menu: two items with no old buildings', String(await dlg.locator('[role="menuitem"]').count()));
await shot('B3-T11c-nobuilding-menu');
await page.keyboard.press('Escape');
await idle(300);
check((await dlg.count()) === 1 && (await dlg.locator('[role="menu"]').count()) === 0, 'Escape closes the menu only, not the dialog');
a = await active();
check(a.tag === 'BUTTON' && /Building/.test(a.text), 'Escape returns the focus to the Building button', JSON.stringify(a));

// Step 2: create "Tower" through the real flow. Height must not change when the first level is added.
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Tower');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(400);
check(/0 levels, 0 sheets/.test((await dlg.textContent()) ?? ''), 'Tower created, empty');
const hBefore = await rect();
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(300);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(300);
const hAfter = await rect();
check(hBefore.h === hAfter.h && hBefore.top === hAfter.top && hBefore.w === hAfter.w, 'dialog size and position are the same before and after the first level', `${JSON.stringify(hBefore)} ${JSON.stringify(hAfter)}`);
await items('level').nth(0).click();
await idle(300);
const n0 = dlg.locator('[data-testid="level-row"]').locator('input[aria-label="Level name"]');
await n0.fill('Ground floor');
await n0.press('Enter');
await idle(400);
check((await items('level').count()) === 2, 'tree: two level items under Tower', String(await items('level').count()));
check(/Ground floor/.test((await items('level').nth(0).textContent()) ?? '') && /0 sheets/.test((await items('level').nth(0).textContent()) ?? ''), 'tree: the level shows its name and 0 sheets (the rename shows at once)');
check((await items('building').count()) === 1 && (await items('building').first().getAttribute('class'))?.includes('mep-tree-item--open') === true, 'tree: Tower is the open building (no Open badge)');
check((await items('building').first().getAttribute('aria-expanded')) === 'true', 'tree: the open building is expanded');
check(/2 levels, 0 sheets/.test((await dlg.locator('.mep-buildings-header').textContent()) ?? ''), 'header shows the counts');
await shot('B3-T11c-wide-tower');

// Step 3: a PDF that waits shows the Not placed node. Assign its page: the node goes away.
const addPdf = async (name, file) => {
  await page.evaluate(async ([b, n]) => {
    if (b !== null) {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
      await w.close();
    }
    window.__nextFile = n;
  }, [file === null ? null : b64(file), name]);
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
  await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
  await idle(900);
};
await addPdf('ground.pdf', null);
check((await items('not-placed').count()) === 1 && /^Not placed1$/.test((await items('not-placed').textContent()) ?? ''), 'tree: Not placed node shows with 1 page');
await items('not-placed').click();
await idle(300);
check((await items('not-placed').getAttribute('aria-selected')) === 'true', 'Not placed node can be selected');
check((await dlg.locator('[data-testid="pdf-group"]').count()) === 1, 'the sheets pane (pending list) is still there after selecting Not placed');
await dlg.locator('select[aria-label="Level for ground.pdf page 1"]').selectOption({ label: 'Level 2' });
await idle(600);
check((await items('not-placed').count()) === 0, 'tree: Not placed node is gone after the page got a level');
check(/Level 2/.test((await items('level').nth(1).textContent()) ?? '') && /1 sheet\b/.test((await items('level').nth(1).textContent()) ?? ''), 'tree: Level 2 shows 1 sheet');
const towerJson = await readStore();

// Step 4: the active sheet sets the first selection. Close with Escape, reopen.
await closeByEscape();
check((await dlg.count()) === 0, 'Escape closes the dialog');
await openDialog();
check((await items('level').nth(1).getAttribute('aria-selected')) === 'true', 'reopen: the level of the active sheet (Level 2) is selected');
a = await active();
check(a.role === 'treeitem' && a.key.startsWith('l:'), 'reopen: the focus is in the tree', JSON.stringify(a));
check((await dlg.locator('[data-testid="selection-summary"] h4').textContent()) === 'Level 2', 'right pane: the summary is the one of Level 2');
check((await dlg.locator('[role="tree"] [role="treeitem"][tabindex="0"]').count()) === 1, 'roving tabindex: one tab stop in the tree');
check((await dlg.locator('[role="tab"]').count()) === 1 && /Levels and sheets/.test((await dlg.locator('[role="tab"]').textContent()) ?? ''), 'one tab: Levels and sheets');
await shot('B3-T11c-wide-active-level');

// Step 5: a second building "Annex" through the Building menu.
await buildingMenu('New building…');
const name2 = dlg.locator('input[aria-label="Building name"]');
await name2.fill('Annex');
await name2.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(400);
await dlg.locator('[data-testid="tree-add-level"]').click();
await idle(400);
const annexJson = await readStore();
check((await items('building').count()) === 2, 'tree: two buildings in the list', String(await items('building').count()));
check((await items('level').count()) === 1, 'tree: only the open building (Annex) shows levels', String(await items('level').count()));
check(((await items('building').filter({ hasText: 'Annex' }).getAttribute('class')) ?? '').includes('mep-tree-item--open') && !((await items('building').filter({ hasText: 'Tower' }).getAttribute('class')) ?? '').includes('mep-tree-item--open'), 'tree: only Annex is the open building');
await shot('B3-T11c-wide-two-buildings');

// Step 6: switch with one click each. The store gets the file of the target first (dev stand-in).
await loadStore(towerJson);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
check((await items('level').count()) === 2, 'one click on Tower: its 2 levels show', String(await items('level').count()));
check((await items('building').filter({ hasText: 'Tower' }).getAttribute('aria-expanded')) === 'true', 'Tower is expanded after the click');
await loadStore(annexJson);
await items('building').filter({ hasText: 'Annex' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(500);
check((await items('level').count()) === 1, 'one click on Annex: its 1 level shows', String(await items('level').count()));
// A building whose file is gone shows the message of the controller.
await loadStore(JSON.stringify({ ...JSON.parse(towerJson), id: 'x-other' })); // the stored id no longer matches
await items('building').filter({ hasText: 'Tower' }).click();
await idle(600);
check(/was not found/.test((await dlg.textContent()) ?? ''), 'a building whose file does not match shows the message', ((await dlg.textContent()) ?? '').slice(0, 200));
await dlg.locator('button', { hasText: /^Dismiss$/ }).click();
await idle(200);
check(!/was not found/.test((await dlg.textContent()) ?? ''), 'Dismiss clears the message');

// Step 7: keyboard walk in the tree (Annex open, 1 level).
await loadStore(towerJson);
await items('building').filter({ hasText: 'Tower' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });
await idle(500);
await closeByEscape();
await openDialog();
a = await active();
check(a.role === 'treeitem', 'keyboard: the dialog opens with the focus in the tree', JSON.stringify(a));
await page.keyboard.press('Home');
a = await active();
check(a.key.startsWith('b:'), 'Home: first node (a building)', JSON.stringify(a));
await page.keyboard.press('End');
a = await active();
check(a.role === 'treeitem' && a.key.startsWith('a:'), 'End: last node (Add level)', JSON.stringify(a));
await page.keyboard.press('Home');
const openKey = await dlg.locator('[role="treeitem"][data-kind="building"][aria-expanded="true"]').getAttribute('data-key');
// Move to the open building, collapse and expand it.
for (let i = 0; i < 6 && (await active()).key !== openKey; i += 1) await page.keyboard.press('ArrowDown');
check((await active()).key === openKey, 'ArrowDown reaches the open building');
await page.keyboard.press('ArrowLeft');
await idle(200);
check((await items('level').count()) === 0 && (await dlg.locator(`[data-key="${openKey}"]`).getAttribute('aria-expanded')) === 'false', 'ArrowLeft collapses the open building');
await page.keyboard.press('ArrowRight');
await idle(200);
check((await items('level').count()) === 2, 'ArrowRight expands it again');
await page.keyboard.press('ArrowRight');
a = await active();
check(a.key.startsWith('l:'), 'ArrowRight again: the focus goes to the first level', JSON.stringify(a));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Enter');
await idle(300);
const focusedKey = (await active()).key;
check((await dlg.locator(`[data-key="${focusedKey}"]`).getAttribute('aria-selected')) === 'true', 'Enter selects the focused level');
check((await dlg.locator('[data-testid="selection-summary"] h4').textContent()) === 'Ground floor', 'right pane shows the selected level', (await dlg.locator('[data-testid="selection-summary"] h4').textContent()) ?? '');
await page.keyboard.press('ArrowLeft');
a = await active();
check(a.key === openKey, 'ArrowLeft on a level goes to its building', JSON.stringify(a));
const ring = await page.evaluate(() => {
  const s = getComputedStyle(document.activeElement);
  return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
});
check(ring.style !== 'none' && ring.width >= 2, 'the focused tree item has a visible focus ring (2 px or more)', JSON.stringify(ring));
await shot('B3-T11c-focus-ring-tree');
await page.keyboard.press('Tab');
a = await active();
check(a.role !== 'treeitem', 'Tab leaves the tree', JSON.stringify(a));
await page.keyboard.press('Tab');
await shot('B3-T11c-focus-ring-button');
const ring2 = await page.evaluate(() => {
  const s = getComputedStyle(document.activeElement);
  return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), tag: document.activeElement.tagName };
});
check(ring2.style !== 'none' && ring2.width >= 2, 'a focused control has a visible focus ring', JSON.stringify(ring2));

// Step 8: a reload closes the building, then the tree still lists the buildings.
await reloadPage();
await openDialog();
check(/No building is open/.test((await dlg.textContent()) ?? ''), 'reload: no building is open');
check((await items('building').count()) === 2 && (await items('level').count()) === 0, 'tree: both buildings are listed, no levels, none open');
check((await dlg.locator('.mep-tree-badge').count()) === 0, 'tree: no Open marker with no building open');
await shot('B3-T11c-nobuilding-tree');
await loadStore(annexJson);
await items('building').filter({ hasText: 'Annex' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
check((await items('level').count()) === 1, 'a click in the tree opens a building after Close building (Annex, 1 level)', String(await items('level').count()));
check((await clipped()).length === 0, 'wide: no clipped control', JSON.stringify(await clipped()));
const dim = await rect();
check(dim.w === 1100 && dim.h === 760, 'wide: still 1100x760', JSON.stringify(dim));

// Step 9: narrow window 760x640: one column, a select replaces the tree.
await closeByEscape();
await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
await openDialog();
check((await dlg.locator('[role="tree"]').count()) === 0, 'narrow: no tree');
const sel = dlg.locator('select[aria-label="Building or level"]');
check((await sel.count()) === 1 && (await sel.isVisible()), 'narrow: a select over buildings and levels');
a = await active();
check(a.tag === 'SELECT' && a.label === 'Building or level', 'narrow: the focus is on the select', JSON.stringify(a));
const optionTexts = await sel.locator('option').allInnerTexts();
check(optionTexts.length >= 3, 'narrow: the select lists the buildings and the levels', JSON.stringify(optionTexts));
const dimN = await rect();
check(dimN.w <= 760 && dimN.h <= 640 && dimN.h >= 640 * 0.85, 'narrow: the dialog fits the window (88 percent of the height)', JSON.stringify(dimN));
check((await clipped()).length === 0, 'narrow: no clipped control', JSON.stringify(await clipped()));
check((await dlg.locator('.mep-modal-actions button').isVisible()), 'narrow: the Close button is visible');
await shot('B3-T11c-narrow');
await sel.selectOption({ index: optionTexts.findIndex((x) => /Level 1/.test(x)) >= 0 ? optionTexts.findIndex((x) => /Level 1/.test(x)) : 1 });
await idle(300);
check((await dlg.locator('[data-testid="selection-summary"] h4').count()) === 1, 'narrow: choosing a level in the select shows its summary', (await dlg.locator('[data-testid="selection-summary"] h4').textContent()) ?? '');
await shot('B3-T11c-narrow-level');

await page.setViewportSize({ width: 1600, height: 1000 });
await idle(400);
check((await dlg.locator('[role="tree"]').count()) === 1 && (await dlg.locator('select[aria-label="Building or level"]').count()) === 0, 'back to wide: the tree replaces the select');

await t.finish();
