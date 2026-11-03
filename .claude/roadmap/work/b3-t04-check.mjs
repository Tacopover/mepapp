// B3-T04: Sheets pane. Add PDFs through the real "Add PDFs…" button (OPFS stub picker), assign pages with real selects.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const groups = () => dlg.locator('[data-testid="pdf-group"]');
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
async function addPdf(name, file) {
  await putFile(name, b64(file));
  await dlg.locator('[role="treeitem"][data-kind="building"]').first().click();
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

check((await dlg.locator('[data-testid="add-actions"]').count()) === 1, 'add action row is shown');
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

// Add the two one-page fixtures.
await addPdf('ground.pdf', '00_arch_ground_floor.pdf');
check((await groups().count()) === 1, 'one PDF group after the first add', String(await groups().count()));
check(/ground\.pdf/.test(await groups().first().textContent()), 'group shows the file name');
check((await groups().first().locator('[data-testid="page-row"]').count()) === 1, 'one page row for a 1-page PDF');
await addPdf('first.pdf', '01_arch_first_floor.pdf');
check((await groups().count()) === 2, 'two PDF groups', String(await groups().count()));
check(/2 PDFs, 2 pages, 0 assigned/.test(await dlg.locator('[data-testid="sheets-totals"]').textContent()), 'totals line before assigning', await dlg.locator('[data-testid="sheets-totals"]').textContent());

// Adding the same PDF again is refused with a notice.
await addPdf('ground.pdf', '00_arch_ground_floor.pdf');
await dlg.locator('[role="treeitem"][data-kind="not-placed"]').click();
await idle(300);
check((await groups().count()) === 2, 'same PDF twice: still two groups');
check(/already in the list/.test((await dlg.locator('[data-testid="sheets-notice"]').textContent()) ?? ''), 'notice for the duplicate');

// Assign page of ground.pdf to Ground floor and first.pdf to Level 1 with the real selects.
await dlg.locator('select[aria-label="Level for ground.pdf page 1"]').selectOption({ label: 'Ground floor' });
await idle(300);
await dlg.locator('select[aria-label="Level for first.pdf page 1"]').selectOption({ label: 'Level 1' });
await idle(300);
let s = await stored();
check(s.sheets.length === 2, 'two sheets stored', String(s.sheets.length));
const byName = (n) => s.sheets.find((x) => x.location.fileName === n);
const lvl = (id) => s.levels.find((l) => l.id === id)?.name;
check(lvl(byName('ground.pdf')?.levelId) === 'Ground floor', 'ground.pdf sheet is on Ground floor');
check(lvl(byName('first.pdf')?.levelId) === 'Level 1', 'first.pdf sheet is on Level 1');
check(byName('ground.pdf')?.pageIndex === 0 && byName('ground.pdf')?.displayName === 'ground.pdf', 'sheet page index 0 and display name', JSON.stringify(byName('ground.pdf')));
check(/2 sheets/.test(await dlg.textContent()), 'dialog says 2 sheets');
check((await dlg.locator('[data-testid="sheets-totals"]').count()) === 0, 'no totals line once every waiting PDF is assigned');
await shot('B3-T04-assign');

// The level with a sheet cannot be deleted any more.
await items('level').nth(0).click();
await idle(300);
check(await row.locator('button', { hasText: /^Delete$/ }).isDisabled(), 'level with a sheet: Delete disabled');

// Multi-page PDF: three page rows; assign p1 and p2, leave p3.
await addPdf('multi.pdf', 'Sample Project_multi_page.pdf');
const multi = groups().filter({ hasText: 'multi.pdf' });
check((await multi.locator('[data-testid="page-row"]').count()) === 3, 'multi-page PDF shows 3 page rows', String(await multi.locator('[data-testid="page-row"]').count()));
await multi.locator('select[aria-label="Level for multi.pdf page 1"]').selectOption({ label: 'Ground floor' });
await idle(300);
await multi.locator('select[aria-label="Level for multi.pdf page 2"]').selectOption({ label: 'Level 1' });
await idle(300);
s = await stored();
const multiSheets = s.sheets.filter((x) => x.location.fileName === 'multi.pdf').sort((a, b) => a.pageIndex - b.pageIndex);
check(multiSheets.length === 2 && multiSheets[0].pageIndex === 0 && multiSheets[1].pageIndex === 1, 'two multi-page sheets, page indexes 0 and 1', JSON.stringify(multiSheets.map((x) => x.pageIndex)));
check(multiSheets[1].displayName === 'multi.pdf p2', 'display name has the page', multiSheets[1].displayName);
check(/2 assigned/.test(await dlg.locator('[data-testid="sheets-totals"]').textContent()), 'totals count', await dlg.locator('[data-testid="sheets-totals"]').textContent());

// Move page 2 to Ground floor (moveSheet keeps the sheet id).
const id2 = multiSheets[1].id;
await showLevel('Level 1');
await sheetGroups().filter({ hasText: 'multi.pdf' }).locator('select[aria-label="Move multi.pdf page 2 to level"]').selectOption({ label: 'Ground floor' });
await idle(300);
s = await stored();
const moved = s.sheets.find((x) => x.id === id2);
check(moved && lvl(moved.levelId) === 'Ground floor', 'page 2 moved to Ground floor with the same sheet id');
// Remove removes the sheet; its page waits in the add pane again.
await showLevel('Ground floor');
await sheetGroups().filter({ hasText: 'multi.pdf' }).locator('button[aria-label="Remove multi.pdf page 2"]').click();
await idle(300);
await dlg.locator('[role="treeitem"]', { hasText: 'Not placed' }).click();
await idle(300);
s = await stored();
check(!s.sheets.some((x) => x.id === id2), 'Remove removes the sheet');
check((await multi.locator('select[aria-label="Level for multi.pdf page 2"]').count()) === 1, 'removed page 2 waits in the add pane');
await shot('B3-T04-multi');

// A file that is not a PDF: error notice, no group added.
const before = await groups().count();
await putFile('notes.pdf', Buffer.from('this is not a pdf').toString('base64'));
await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
await idle(900);
check((await groups().count()) === before, 'a non-PDF adds no group');
check(/Could not read notes\.pdf/.test((await dlg.locator('[data-testid="sheets-notice"]').textContent()) ?? ''), 'error notice for the non-PDF', (await dlg.locator('[data-testid="sheets-notice"]').textContent()) ?? '');

t.errors.length = 0; // the MuPDF messages of the deliberate non-PDF step are expected

// Close and reopen: pending pages are gone, assigned sheets stay as groups.
await dlg.locator('.mep-modal-actions button', { hasText: /^Close$/ }).click();
await idle(300);
await dlg.locator('[data-testid="close-anyway"]').click();
await idle(300);
await menu('Manage Buildings…');
await dlg.waitFor({ state: 'visible', timeout: 8000 });
await idle(300);
await items('building').first().click();
await idle(300);
const reopened = await sheetGroups().count();
check(reopened === 3, 'after reopening: 3 groups from the stored sheets', String(reopened));
check((await dlg.locator('select[aria-label="Move multi.pdf page 1 to level"]').count()) === 1, 'multi.pdf page 1 is still assigned');
check((await dlg.locator('select[aria-label="Level for multi.pdf page 3"]').count()) === 0, 'unassigned page 3 is not listed after reopening');
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
check((await sheetGroups().filter({ hasText: 'multi.pdf' }).count()) === 0, 'no multi.pdf group left after the removal');

await t.finish();
