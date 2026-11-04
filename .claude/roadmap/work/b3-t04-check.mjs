// B3-T04: Sheets on levels. Add PDFs to a level through the real "Add PDFs…" button (OPFS stub picker), move a page with the real select.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const groups = () => dlg.locator('[data-testid="level-sheets"] [data-testid="pdf-group"]');
const sheetGroups = () => dlg.locator('[data-testid="level-sheets"] [data-testid="pdf-group"]');
const showLevel = async (name) => { await dlg.locator('[role="treeitem"][data-kind="level"]', { hasText: name }).click(); await idle(300); };

async function putFile(name, bytesB64) {
  await page.evaluate(
    async ([b64, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
      await w.close();
      window.__nextFile = n;
    },
    [bytesB64, name],
  );
}
const b64 = (file) => readFileSync(FIX + file).toString('base64');
async function addPdf(name, file, level) {
  await putFile(name, b64(file));
  await dlg.locator('[role="treeitem"][data-kind="level"]', { hasText: level }).click();
  await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
  await idle(900);
}

await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Tower');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Tower' }).waitFor({ timeout: 8000 });

check((await dlg.locator('button', { hasText: /^Add PDFs…$/ }).count()) === 0, 'building node: no Add PDFs button');
check((((await dlg.locator('[data-testid="open-documents"]').textContent()) ?? '').includes('Add a level first.')), 'no level: the strip says Add a level first.');
check((await dlg.locator('[data-testid="sheets-pane"]').count()) === 0, 'no Not placed pane before an add');

// Two levels by typing.
const items = (kind) => dlg.locator(`[role="treeitem"][data-kind="${kind}"]`);
const add = dlg.locator('[data-testid="tree-add-level"]');
await add.click();
await idle(300);
await add.click();
await idle(300);
const row = dlg.locator('[data-testid="level-row"]');
await items('level').nth(0).click();
await idle(300);
const n0 = row.locator('input[aria-label="Level name"]');
await n0.fill('Ground floor');
await n0.press('Enter');
await idle(300);
await items('level').nth(1).click();
await idle(300);
const n1 = row.locator('input[aria-label="Level name"]');
await n1.fill('Level 1');
await n1.press('Tab');
await idle(300);

// Add one one-page fixture to each level: the page appears on its level at once.
await addPdf('ground.pdf', '00_arch_ground_floor.pdf', 'Ground floor');
check((await groups().count()) === 1, 'one PDF group on Ground floor after the add', String(await groups().count()));
check(/ground\.pdf/.test(await groups().first().textContent()), 'group shows the file name');
check((await groups().first().locator('[data-testid="page-row"]').count()) === 1, 'one page row for a 1-page PDF');
check(/^Added 1 page to Ground floor\./.test((await dlg.locator('[data-testid="add-result"]').textContent()) ?? ''), 'add result says Added 1 page to Ground floor.');
await addPdf('first.pdf', '01_arch_first_floor.pdf', 'Level 1');
check((await groups().count()) === 1 && /first\.pdf/.test(await groups().first().textContent()), 'Level 1 shows first.pdf at once', String(await groups().count()));
check(/^Added 1 page to Level 1\./.test((await dlg.locator('[data-testid="add-result"]').textContent()) ?? ''), 'add result says Added 1 page to Level 1.');

// Adding the same PDF to the same level again adds nothing.
await addPdf('ground.pdf', '00_arch_ground_floor.pdf', 'Ground floor');
check((await groups().count()) === 1, 'same PDF again: still one group on Ground floor');
check(/^Nothing added\. 1 page is already on this level\./.test((await dlg.locator('[data-testid="add-result"]').textContent()) ?? ''), 'notice for the page already on this level', (await dlg.locator('[data-testid="add-result"]').textContent()) ?? '');

let s = await stored();
check(s.sheets.length === 2, 'two sheets stored', String(s.sheets.length));
const byName = (n) => s.sheets.find((x) => x.location.fileName === n);
const lvl = (id) => s.levels.find((l) => l.id === id)?.name;
check(lvl(byName('ground.pdf')?.levelId) === 'Ground floor', 'ground.pdf sheet is on Ground floor');
check(lvl(byName('first.pdf')?.levelId) === 'Level 1', 'first.pdf sheet is on Level 1');
check(byName('ground.pdf')?.pageIndex === 0 && byName('ground.pdf')?.displayName === 'ground.pdf', 'sheet page index 0 and display name', JSON.stringify(byName('ground.pdf')));
check(/2 sheets/.test(await dlg.textContent()), 'dialog says 2 sheets');
await shot('B3-T04-assign');

// The level with a sheet cannot be deleted any more.
await items('level').nth(0).click();
await idle(300);
check(await row.locator('button', { hasText: /^Delete$/ }).isDisabled(), 'level with a sheet: Delete disabled');

// Multi-page PDF on Ground floor: three page rows, all placed at once; move page 2 to Level 1.
await addPdf('multi.pdf', 'Sample Project_multi_page.pdf', 'Ground floor');
const multi = groups().filter({ hasText: 'multi.pdf' });
check((await multi.locator('[data-testid="page-row"]').count()) === 3, 'multi-page PDF shows 3 page rows', String(await multi.locator('[data-testid="page-row"]').count()));
check(/^Added 3 pages to Ground floor\./.test((await dlg.locator('[data-testid="add-result"]').textContent()) ?? ''), 'add result says Added 3 pages to Ground floor.');
s = await stored();
const multiSheets = s.sheets.filter((x) => x.location.fileName === 'multi.pdf').sort((a, b) => a.pageIndex - b.pageIndex);
check(multiSheets.length === 3 && multiSheets.map((x) => x.pageIndex).join() === '0,1,2', 'three multi-page sheets, page indexes 0, 1 and 2', JSON.stringify(multiSheets.map((x) => x.pageIndex)));
check(multiSheets[1].displayName === 'multi.pdf p2', 'display name has the page', multiSheets[1].displayName);

// Move page 2 to Level 1 (moveSheet keeps the sheet id).
const id2 = multiSheets[1].id;
await multi.locator('select[aria-label="Move multi.pdf page 2 to level"]').selectOption({ label: 'Level 1' });
await idle(300);
s = await stored();
const moved = s.sheets.find((x) => x.id === id2);
check(moved && lvl(moved.levelId) === 'Level 1', 'page 2 moved to Level 1 with the same sheet id');
// Remove on Level 1 removes that sheet only.
await showLevel('Level 1');
await sheetGroups().filter({ hasText: 'multi.pdf' }).locator('button[aria-label="Remove multi.pdf page 2"]').click();
await idle(300);
s = await stored();
check(!s.sheets.some((x) => x.id === id2), 'Remove removes the sheet');
check((await sheetGroups().filter({ hasText: 'multi.pdf' }).count()) === 0, 'Level 1 shows no multi.pdf page after the removal');
await shot('B3-T04-multi');

// A file that is not a PDF: error notice, no group added.
const before = await groups().count();
await putFile('notes.pdf', Buffer.from('this is not a pdf').toString('base64'));
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(900);
check((await groups().count()) === before, 'a non-PDF adds no group');
check(/Nothing added\. Could not read notes\.pdf\./.test((await dlg.locator('[data-testid="add-result"]').textContent()) ?? ''), 'error notice for the non-PDF', (await dlg.locator('[data-testid="add-result"]').textContent()) ?? '');

t.errors.length = 0; // the MuPDF messages of the deliberate non-PDF step are expected

// Close and reopen: the sheets stay on their levels. Close closes at once, no ask.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(500);
check((await page.locator('.mep-modal').count()) === 0 && (await dlg.locator('[data-testid="close-ask"]').count()) === 0, 'Close closes the dialog at once, no ask');
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(300);
await items('building').first().click();
await idle(300);
const reopened = await dlg.locator('[data-testid="level-sheets"] [data-testid="level-group"]').count();
const reopenedRows = await dlg.locator('[data-testid="level-sheets"] [data-testid="page-row"]').count();
check(reopened === 2 && reopenedRows === 4, 'after reopening: 2 level groups with the 4 stored sheets', `${reopened} groups, ${reopenedRows} rows`);
check((await dlg.locator('select[aria-label="Move multi.pdf page 1 to level"]').count()) === 1, 'multi.pdf page 1 is still on its level');
check((await dlg.locator('select[aria-label="Move multi.pdf page 3 to level"]').count()) === 1, 'multi.pdf page 3 is listed after reopening');
await shot('B3-T04-reopened');

// Remove: one button for each sheet row. Clears every sheet of one PDF.
const countBefore = (await stored()).sheets.length;
const multiRemove = dlg.locator('button[aria-label^="Remove multi.pdf page"]');
const multiRows = await multiRemove.count();
for (let i = 0; i < multiRows; i += 1) {
  await multiRemove.first().click();
  await idle(400);
}
check((await stored()).sheets.length === countBefore - multiRows && !(await stored()).sheets.some((x) => x.location.fileName === 'multi.pdf'), 'Remove on each row clears the PDF');
check((await dlg.locator('[data-testid="level-sheets"] [data-testid="level-group"]').filter({ hasText: 'multi.pdf' }).count()) === 0, 'no multi.pdf group left after the removal');

await t.finish();
