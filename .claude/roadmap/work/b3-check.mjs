// B3-T10: the part check. One run from an empty profile with real clicks and typing.
// Web dev stand-ins (the native Tauri parts cannot run here): the OPFS picker stubs give files by name; a web file has no path, so the check adds `location.path` (= the file name, read by the dev statPath/readPath) to the stored building through the dev hook, the way the desktop gives real paths.
import { readFileSync } from 'node:fs';
import { open } from '/root/MepApp/.claude/worktrees/buildings-model/.claude/roadmap/browser/lib.mjs';

const FIX = '/root/MepApp/.claude/worktrees/buildings-model/fixtures/pdfs/';
const t = await open();
const { page, check, shot, idle, menu, until, statusText } = t;
await t.start();

const dlg = page.locator('.mep-modal');
const stored = () => page.evaluate(async () => JSON.parse((await window.__mepBuilding.read()).json));
const groups = () => dlg.locator('[data-testid="pdf-group"]');
const groupOf = (n) => groups().filter({ hasText: n });
const statusOf = async (n) => (await groupOf(n).locator('[data-testid="sheet-status"]').first().getAttribute('data-status')) ?? '';
const b64 = (file) => readFileSync(FIX + file).toString('base64');
async function putFile(name, b64text) {
  await page.evaluate(
    async ([b, n]) => {
      const w = await (await (await navigator.storage.getDirectory()).getFileHandle(n, { create: true })).createWritable();
      await w.write(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)));
      await w.close();
      window.__nextFile = n;
    },
    [b64text, name],
  );
}
async function addPdf(name, file) {
  if (file === null) await page.evaluate((n) => { window.__nextFile = n; }, name);
  else await putFile(name, b64(file));
  await dlg.locator('button', { hasText: /^Add PDFs…$/ }).click();
  await idle(900);
}
async function openDialog() {
  await menu('Manage Buildings…');
  await dlg.waitFor({ state: 'visible', timeout: 8000 });
  await idle(500);
}
async function saveActive(label) {
  await menu('Save');
  await until(async () => /Saved |Failed/.test(await statusText()), `save ${label}`);
  await idle(800);
  check(/^Saved /.test(await statusText()), `${label} saved (stamped with a document id)`, await statusText());
}

// Step 0: two real documents are stamped by a Save (the building needs ids to build summaries).
await t.openPdf(FIX + '00_arch_ground_floor.pdf', 'ground.pdf');
await saveActive('ground.pdf');
await t.openPdf(FIX + '01_arch_first_floor.pdf', 'first.pdf');
await saveActive('first.pdf');

// Step 1: create a building.
await openDialog();
await dlg.locator('button', { hasText: /^New building$/ }).click();
const nameInput = dlg.locator('input[aria-label="Building name"]');
await nameInput.fill('Office block');
await nameInput.press('Enter');
await dlg.locator('.mep-buildings-open-name', { hasText: 'Office block' }).waitFor({ timeout: 8000 });
check(/0 levels, 0 sheets/.test(await dlg.textContent()), 'step 1: building created, empty');
await shot('B3-T10-1-created');

// Step 2: two levels, elevation 0 and 3000, by typing.
const add = dlg.locator('button', { hasText: /^Add level$/ });
await add.click();
await idle(300);
await add.click();
await idle(300);
const rows = dlg.locator('[data-testid="level-row"]');
const n0 = rows.nth(0).locator('input[aria-label="Level name"]');
await n0.fill('Ground floor');
await n0.press('Enter');
await idle(300);
const e0 = rows.nth(0).locator('input[aria-label="Elevation (mm)"]');
await e0.fill('0');
await e0.press('Enter');
await idle(300);
const n1 = rows.nth(1).locator('input[aria-label="Level name"]');
await n1.fill('Level 1');
await n1.press('Tab');
await idle(300);
const e1 = rows.nth(1).locator('input[aria-label="Elevation (mm)"]');
await e1.fill('3000');
await e1.press('Enter');
await idle(500);
let s = await stored();
check(s.levels.length === 2 && s.levels[0].name === 'Ground floor' && s.levels[1].name === 'Level 1', 'step 2: two levels stored', JSON.stringify(s.levels));
check(s.levels[0].elevationMm === 0 && s.levels[1].elevationMm === 3000, 'step 2: elevations 0 and 3000', JSON.stringify(s.levels.map((l) => l.elevationMm)));
await shot('B3-T10-2-levels');

// Step 3: add the PDFs and assign pages (the multi-page file proves the select of each page).
await addPdf('ground.pdf', null);
await addPdf('first.pdf', null);
await addPdf('multi.pdf', 'Sample Project_multi_page.pdf');
check((await groups().count()) === 3, 'step 3: three PDFs listed', String(await groups().count()));
check((await groupOf('multi.pdf').locator('[data-testid="page-row"]').count()) === 3, 'step 3: multi.pdf has 3 page rows');
await dlg.locator('select[aria-label="Level for ground.pdf page 1"]').selectOption({ label: 'Ground floor' });
await idle(300);
await dlg.locator('select[aria-label="Level for first.pdf page 1"]').selectOption({ label: 'Level 1' });
await idle(300);
await dlg.locator('select[aria-label="Level for multi.pdf page 1"]').selectOption({ label: 'Ground floor' });
await idle(300);
await dlg.locator('select[aria-label="Level for multi.pdf page 2"]').selectOption({ label: 'Level 1' });
await idle(500);
s = await stored();
check(s.sheets.length === 4, 'step 3: four sheets stored', String(s.sheets.length));
const fileId = (n) => s.sheets.find((x) => x.location.fileName === n)?.projectUuid;
check(!!fileId('ground.pdf') && !!fileId('first.pdf') && fileId('multi.pdf') === null, 'step 3: stamped files are linked to their ids, multi.pdf is not stamped');
await shot('B3-T10-3-sheets');

// Dev stand-in for desktop paths: the file name is the path in OPFS.
s.sheets = s.sheets.map((x) => ({ ...x, location: { ...x.location, path: x.location.fileName } }));
await page.evaluate((j) => window.__mepBuilding.load(j), JSON.stringify(s));
await idle(800);
check((await statusOf('ground.pdf')) === 'no-summary', 'step 3: stamped file without summary says no summary', await statusOf('ground.pdf'));

// Step 4: rebuild summaries.
await dlg.locator('[data-testid="rebuild-summaries"]').click();
await dlg.locator('[data-testid="rebuild-result"]').waitFor({ timeout: 60000 });
await idle(800);
const result = (await dlg.locator('[data-testid="rebuild-result"]').textContent()) ?? '';
check(/Rebuilt 2 of 3 summaries/.test(result), 'step 4: 2 of 3 summaries rebuilt', result);
check(/multi\.pdf/.test((await dlg.locator('[data-testid="rebuild-failures"]').textContent().catch(() => '')) ?? ''), 'step 4: multi.pdf is in the failure list');
check((await statusOf('ground.pdf')) === 'ok' && (await statusOf('first.pdf')) === 'ok', 'step 4: both stamped files are ok', `${await statusOf('ground.pdf')} ${await statusOf('first.pdf')}`);
check(/Summary saved \d{4}-\d{2}-\d{2}/.test(await groupOf('first.pdf').textContent()), 'step 4: the row shows the summary date');
await shot('B3-T10-4-rebuilt');

// Step 5: open a sheet.
await groupOf('first.pdf').locator('[data-testid="open-sheet"]').click();
await t.until(async () => (await dlg.count()) === 0, 'dialog closes after open', 60000);
await idle(1500);
const headerLabel = await page.locator('[data-testid="current-sheet-header"]').textContent().catch(() => '');
check(headerLabel === 'Office block / Level 1 / first.pdf', 'step 5: the header shows the opened sheet', headerLabel ?? '');
await shot('B3-T10-5-opened');

// Step 6: delete the PDF, see "PDF missing", relink to a copy.
await page.evaluate(async () => {
  const root = await navigator.storage.getDirectory();
  const bytes = new Uint8Array(await (await (await root.getFileHandle('first.pdf')).getFile()).arrayBuffer());
  const w = await (await root.getFileHandle('first2.pdf', { create: true })).createWritable();
  await w.write(bytes);
  await w.close();
  await root.removeEntry('first.pdf');
  window.__nextFile = 'first2.pdf';
});
await openDialog();
await dlg.locator('[data-testid="refresh-status"]').click();
await idle(800);
check((await statusOf('first.pdf')) === 'pdf-missing', 'step 6: the deleted PDF shows "PDF missing"', await statusOf('first.pdf'));
await shot('B3-T10-6-missing');
await groupOf('first.pdf').locator('[data-testid="relink-pdf"]').click();
await idle(1500);
s = await stored();
check(s.sheets.some((x) => x.location.fileName === 'first2.pdf'), 'step 6: relink stored the new file name', JSON.stringify(s.sheets.map((x) => x.location.fileName)));
await until(async () => (await statusOf('first2.pdf')) !== 'pdf-missing', 'status leaves pdf-missing', 15000).catch(() => {});
check((await groupOf('first2.pdf').locator('[data-testid="relink-pdf"]').count()) === 0, 'step 6: no Relink button after the relink');
await shot('B3-T10-6-relinked');

// Step 7: close the building, open it again from the recent list.
await dlg.locator('button.mep-menu-btn').click();
await dlg.locator('[role=menuitem]', { hasText: 'Close building' }).click();
await idle(400);
check(/No building is open/.test(await dlg.textContent()), 'step 7: building closed');
await dlg.locator('[role=treeitem][data-kind=building]', { hasText: 'Office block' }).click();
await dlg.locator('.mep-buildings-open-name', { hasText: 'Office block' }).waitFor({ timeout: 8000 });
await idle(600);
s = await stored();
check(/2 levels, 4 sheets/.test(await dlg.textContent()), 'step 7: reopened from the recent list with 2 levels and 4 sheets', (await dlg.textContent()).slice(0, 200));
check((await dlg.locator('[data-testid="level-row"] input[aria-label="Elevation (mm)"]').nth(1).inputValue()) === '3000', 'step 7: elevation 3000 survived');
await shot('B3-T10-7-reopened');

await t.finish();
