// B3-T11e: sheets of a level. Real clicks and real selects. Level pane shows only its sheets, Move to, Remove, Relink on a deleted file, status words, footer, add pane, create input.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const levelItem = (name) => dlg.locator('[role="treeitem"][data-kind="level"]', { hasText: name });
const rows = () => dlg.locator('[data-testid="level-sheets"] [data-testid="page-row"]');
const rowOf = (n) => rows().filter({ hasText: n });
const chip = (n) => rowOf(n).locator('[data-testid="sheet-status"]');
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const uuid = () => page.evaluate(() => window.__mepSketchScene.getProjectUuid());
const rowNames = async () => (await rows().locator('b').allInnerTexts()).map((s) => s.trim()).sort();

async function putFile(name, file) {
  await page.evaluate(
    async ([b64, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
      window.__nextFile = n;
    },
    [readFileSync(FIX + file).toString('base64'), name],
  );
}
const removeFile = (n) => page.evaluate(async (name) => { await (await navigator.storage.getDirectory()).removeEntry(name); }, n);
const sizeOf = (n) => page.evaluate(async (name) => (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).size, n);

async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(700);
}

await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'orig.pdf');
const U = await uuid();
await menu('Save');
await until(async () => /Saved |Failed/.test(await statusText()), 'save');
await idle(800);
const size = await sizeOf('orig.pdf');
await putFile('temp.pdf', '01_arch_first_floor.pdf');
await putFile('l1a.pdf', '01_arch_first_floor.pdf');

const summary = JSON.stringify({ version: 1, projectUuid: U, savedAt: '2026-11-02T10:00:00.000Z', sourceSizeBytes: size, sourceModifiedMs: 1, pages: {}, tables: [], warnings: [] });
const sheet = (id, levelId, name, extra = {}) => ({ id, levelId, projectUuid: null, pageIndex: 0, displayName: name, location: { fileName: name, path: name }, ...extra });
const building = {
  schemaVersion: 1, id: 'b-t11e', name: 'Tower',
  levels: [{ id: 'l0', name: 'Ground floor', elevationMm: 0 }, { id: 'l1', name: 'Level 1', elevationMm: 3000 }],
  sheets: [
    sheet('s1', 'l0', 'orig.pdf', { projectUuid: U }),
    sheet('s2', 'l0', 'gone.pdf'),
    { id: 's3', levelId: 'l0', projectUuid: null, pageIndex: 0, displayName: 'nopath.pdf', location: { fileName: 'nopath.pdf' } },
    sheet('s4', 'l1', 'l1a.pdf'),
    sheet('s5', 'l1', 'temp.pdf'),
  ],
  risers: [],
};
await page.evaluate(([j, s]) => window.__mepBuilding.load(j, s), [JSON.stringify(building), { [U]: summary }]);
await idle(400);

await openDialog();

// Level 1 shows only its sheets.
await levelItem('Level 1').click();
await idle(400);
let names = await rowNames();
check(JSON.stringify(names) === JSON.stringify(['l1a.pdf', 'temp.pdf']), 'Level 1 shows only l1a.pdf and temp.pdf', JSON.stringify(names));
check((await chip('temp.pdf').getAttribute('data-status')) !== 'pdf-missing', 'temp.pdf is found before the delete', (await chip('temp.pdf').getAttribute('data-status')) ?? '');
await shot('B3-T11e-level1');

// Ground floor shows its three sheets, with the plain words.
await levelItem('Ground floor').click();
await idle(400);
names = await rowNames();
check(JSON.stringify(names) === JSON.stringify(['gone.pdf', 'nopath.pdf', 'orig.pdf']), 'Ground floor shows its three sheets', JSON.stringify(names));
check((await chip('orig.pdf').textContent())?.trim() === 'OK', 'orig.pdf chip says OK', (await chip('orig.pdf').textContent()) ?? '');
check((await chip('gone.pdf').textContent())?.trim() === 'Missing', 'gone.pdf chip says Missing', (await chip('gone.pdf').textContent()) ?? '');
check((await chip('nopath.pdf').textContent())?.trim() === 'Not saved yet', 'nopath.pdf chip says Not saved yet', (await chip('nopath.pdf').textContent()) ?? '');
check(/Save it in MepApp to link it/.test((await dlg.locator('[data-testid="level-sheets"] [data-testid="pdf-group"]').filter({ hasText: 'nopath.pdf' }).textContent()) ?? ''), 'nopath.pdf group explains the next step');
check(!/stamped/i.test((await dlg.textContent()) ?? ''), 'the word "stamped" is gone from the dialog');
check((await rowOf('nopath.pdf').locator('[data-testid="open-sheet"]').textContent())?.trim() === 'Choose file…', 'a sheet with no path has "Choose file…"');
check((await rowOf('orig.pdf').locator('[data-testid="open-sheet"]').textContent())?.trim() === 'Open', 'a sheet with a path has "Open"');
check((await rowOf('gone.pdf').locator('[data-testid="relink-pdf"]').count()) === 1, 'the missing sheet has Relink… on its row');
check((await rowOf('orig.pdf').locator('[data-testid="relink-pdf"]').count()) === 0, 'an OK sheet has no Relink');
check(/1 of 3 sheets have a summary/.test((await dlg.locator('[data-testid="summary-count"]').textContent()) ?? ''), 'footer: 1 of 3 sheets have a summary', (await dlg.locator('[data-testid="summary-count"]').textContent()) ?? '');
await shot('B3-T11e-ground');

// The three sheet rows and the footer sit inside the detail pane; the pane does not scroll.
const pane = () => page.locator('.mep-buildings-detail');
const paneBox = await pane().boundingBox();
const fitRows = dlg.locator('[data-testid="level-sheets"] [data-testid="page-row"], [data-testid="level-sheets"] [data-testid="summary-count"]');
const fitBoxes = [];
for (let i = 0; i < (await fitRows.count()); i += 1) fitBoxes.push(await fitRows.nth(i).boundingBox());
const fitInside = fitBoxes.every((b) => b !== null && b.y >= paneBox.y - 1 && b.y + b.height <= paneBox.y + paneBox.height + 1);
check(fitBoxes.length === 4 && fitInside, 'Ground floor: the sheet rows and the footer sit inside the detail pane', JSON.stringify({ paneBox, fitBoxes }));
check((await pane().evaluate((el) => el.scrollTop)) === 0, 'Ground floor: the detail pane does not scroll');
await shot('B3-T11e-ground3');

// A sheet without a saved path: one hint line under its row, and no "No summary" text.
check((await dlg.locator('[data-testid="level-sheets"] [data-testid="pdf-group"]').filter({ hasText: 'nopath.pdf' }).locator('[data-testid="sheet-hint"]').count()) === 1, 'nopath.pdf: one hint line under its row');
check(!/No summary/.test((await rowOf('nopath.pdf').textContent()) ?? ''), 'nopath.pdf row does not say "No summary"');

// Narrow window: the tree is a select, and the sheet rows fit the pane width.
await page.setViewportSize({ width: 760, height: 640 });
await idle(500);
const picker = dlg.locator('select[aria-label="Building or level"]');
const groundValue = await picker.locator('option').evaluateAll((opts) => opts.find((o) => o.textContent.trim().startsWith('Ground floor'))?.value ?? '');
await picker.selectOption(groundValue);
await idle(400);
const widths = await pane().evaluate((el) => [el.scrollWidth, el.clientWidth]);
check(widths[0] <= widths[1] + 1, 'narrow: the detail pane has no horizontal scroll', JSON.stringify(widths));
const lastRow = dlg.locator('[data-testid="level-sheets"] [data-testid="page-row"]').last();
await lastRow.scrollIntoViewIfNeeded();
await idle(200);
const lastBox = await lastRow.boundingBox();
const narrowPaneBox = await pane().boundingBox();
check(lastBox !== null && lastBox.x + lastBox.width <= narrowPaneBox.x + narrowPaneBox.width + 1, 'narrow: the last sheet row ends inside the pane', JSON.stringify({ lastBox, narrowPaneBox }));
await shot('B3-T11e-narrow');
await page.setViewportSize({ width: 1600, height: 1000 });
await idle(500);

// Move to: l1a.pdf from Level 1 to Ground floor.
await levelItem('Level 1').click();
await idle(300);
const move = rowOf('l1a.pdf').locator('select');
const opts = await move.locator('option').allInnerTexts();
check(JSON.stringify(opts) === JSON.stringify(['Move to…', 'Ground floor']), 'Move to lists the other levels only', JSON.stringify(opts));
await move.selectOption({ label: 'Ground floor' });
await idle(600);
check((await stored()).sheets.find((s) => s.id === 's4').levelId === 'l0', 'Move to stored the new level');
names = await rowNames();
check(JSON.stringify(names) === JSON.stringify(['temp.pdf']), 'Level 1 list shrank after Move to', JSON.stringify(names));
await levelItem('Ground floor').click();
await idle(300);
check((await rowNames()).length === 4, 'Ground floor list grew to 4 sheets', JSON.stringify(await rowNames()));

// Relink on a deleted file: temp.pdf on Level 1.
await levelItem('Level 1').click();
await idle(300);
await removeFile('temp.pdf');
await dlg.locator('[data-testid="refresh-status"]').click();
await idle(800);
check((await chip('temp.pdf').getAttribute('data-status')) === 'pdf-missing', 'the deleted temp.pdf shows Missing', (await chip('temp.pdf').getAttribute('data-status')) ?? '');
check((await rowOf('temp.pdf').locator('[data-testid="open-sheet"]').isDisabled()), 'Open is disabled while the PDF is missing');
await shot('B3-T11e-missing');
await putFile('temp2.pdf', '01_arch_first_floor.pdf');
await rowOf('temp.pdf').locator('[data-testid="relink-pdf"]').click();
await idle(1200);
check((await stored()).sheets.find((s) => s.id === 's5').location.fileName === 'temp2.pdf', 'Relink stored the new file name');
check((await rowOf('temp2.pdf').count()) === 1 && (await rowOf('temp2.pdf').locator('[data-testid="relink-pdf"]').count()) === 0, 'the row shows temp2.pdf with no Relink');
check(/Relinked temp2\.pdf/.test((await dlg.locator('[data-testid="sheets-notice"]').textContent()) ?? ''), 'a notice says Relinked');
await shot('B3-T11e-relinked');

// Remove: one sheet only; the PDF file stays.
await rowOf('temp2.pdf').locator('button', { hasText: /^Remove$/ }).click();
await idle(500);
check(!(await stored()).sheets.some((s) => s.id === 's5'), 'Remove deleted the sheet from the building');
check((await stored()).sheets.length === 4, 'the other sheets stay');
check((await rows().count()) === 0 && /No sheets on this level/.test((await dlg.locator('[data-testid="level-sheets"]').textContent()) ?? ''), 'Level 1 now shows the empty text');

// Building node: all sheets.
await dlg.locator('[role="treeitem"][data-kind="building"]').click();
await idle(300);
check((await rows().count()) === 4, 'building node: all four sheets', String(await rows().count()));
check(/Ground floor/.test((await rowOf('orig.pdf').textContent()) ?? ''), 'building node: a row shows its level name');

// Add pane: a pending PDF with 1 page, assign it to Level 1; it appears in the level list.
await putFile('first.pdf', '01_arch_first_floor.pdf');
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(1500);
check((await dlg.locator('[data-testid="sheets-pane"] [data-testid="pdf-group"]').count()) === 1, 'add pane: one waiting PDF');
await dlg.locator('select[aria-label="Level for first.pdf page 1"]').selectOption({ label: 'Level 1' });
await idle(600);
check((await dlg.locator('[data-testid="sheets-pane"] [data-testid="pdf-group"]').count()) === 0, 'add pane: the assigned page leaves the waiting list');
await levelItem('Level 1').click();
await idle(300);
check(JSON.stringify(await rowNames()) === JSON.stringify(['first.pdf']), 'the assigned page shows on Level 1', JSON.stringify(await rowNames()));
await shot('B3-T11e-assigned');

// The create input goes away after a building is created through the Building menu.
await dlg.locator('button.mep-menu-btn').click();
await dlg.locator('[role="menuitem"]', { hasText: 'New building…' }).click();
await idle(200);
const nameBox = dlg.locator('input[aria-label="Building name"]');
check((await nameBox.count()) === 1, 'New building… shows the name input');
await nameBox.fill('Annex');
await nameBox.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Annex' }).waitFor({ timeout: 8000 });
await idle(600);
check((await dlg.locator('input[aria-label="Building name"]').count()) === 0, 'the name input is gone after the building is created');
check((await dlg.locator('.mep-buildings-create').count()) === 0, 'the create row is gone');
await shot('B3-T11e-created');

await t.finish();
